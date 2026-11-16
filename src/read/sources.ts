// Where the scans come from. A folder is files on disk. A list is names and URLs (a Drive file
// link is one). A Drive folder is listed and downloaded with the Drive API. The browser is a
// separate adapter: it needs a running Chromium.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { ImageSize } from "./image.ts";
import { imageSize } from "./image.ts";
import { parseJsonText } from "./json.ts";

export interface ScanRef {
  readonly name: string;
  readonly url: string;
}

export interface ScanFile extends ScanRef {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface ScanSource {
  list(): Promise<readonly ScanRef[]>;
  open(ref: ScanRef): Promise<ScanFile>;
}

export type Measure = (bytes: Uint8Array) => ImageSize;

const IMAGE_NAME = /\.(jpe?g|png|webp)$/i;

/** The images of a directory, in page order (`2` before `10`). The file name without the extension is the scan name. */
export function folderSource(dir: string, measure: Measure = imageSize): ScanSource {
  return {
    list(): Promise<ScanRef[]> {
      const names = readdirSync(dir)
        .filter((name) => IMAGE_NAME.test(name))
        .toSorted((left, right) => left.localeCompare(right, undefined, { numeric: true }));
      return Promise.resolve(
        names.map((file) => ({ name: file.replace(/\.[^.]+$/u, ""), url: join(dir, file) })),
      );
    },
    open(ref: ScanRef): Promise<ScanFile> {
      const bytes = new Uint8Array(readFileSync(ref.url));
      const size = measure(bytes);
      return Promise.resolve({ ...ref, bytes, ...size });
    },
  };
}

/** A text file of `name<tab>url` lines. `#` starts a comment. This is how a list of Drive file links is given. */
export function listSource(
  text: string,
  fetchFn: typeof fetch = fetch,
  measure: Measure = imageSize,
): ScanSource {
  const refs = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => {
      const tab = line.indexOf("\t");
      if (tab <= 0) throw new Error(`a list line is a name, a tab and a url: ${line}`);
      return { name: line.slice(0, tab).trim(), url: line.slice(tab + 1).trim() };
    });
  return urlSource(refs, fetchFn, measure);
}

/** A Drive "view" link is a page. The file itself is the download link with the same id. */
export function downloadUrl(url: string): string {
  if (!url.includes("drive.google.com")) return url;
  const match = /\/file\/d\/([^/]+)/u.exec(url) ?? /[?&]id=([^&]+)/u.exec(url);
  const id = match?.[1];
  if (id === undefined) return url;
  return `https://drive.google.com/uc?export=download&id=${id}`;
}

/** Downloads each scan when it is opened. The listing itself does not download. */
export function urlSource(
  refs: readonly ScanRef[],
  fetchFn: typeof fetch = fetch,
  measure: Measure = imageSize,
): ScanSource {
  return {
    list(): Promise<readonly ScanRef[]> {
      return Promise.resolve(refs);
    },
    async open(ref: ScanRef): Promise<ScanFile> {
      const response = await fetchFn(downloadUrl(ref.url));
      if (!response.ok)
        throw new Error(`scan ${ref.name} answered HTTP ${String(response.status)}`);
      const type = response.headers.get("content-type") ?? "";
      if (type.startsWith("text/html")) {
        throw new Error(
          `scan ${ref.name} came back as a page, not an image; it may need a browser`,
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const size = measure(bytes);
      return { ...ref, bytes, ...size };
    },
  };
}

const driveListSchema = z.object({
  nextPageToken: z.string().optional(),
  files: z
    .array(z.object({ id: z.string(), name: z.string(), mimeType: z.string().optional() }))
    .optional(),
});

const tokenSchema = z.object({ access_token: z.string() });

export interface DriveOptions {
  readonly folderId: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly fetchFn?: typeof fetch;
  readonly measure?: Measure;
}

/**
 * The images of a Google Drive folder. The refresh token is exchanged for an access token on each
 * start; the access token is not stored.
 */
export function driveSource(options: DriveOptions): ScanSource {
  const fetchFn = options.fetchFn ?? fetch;
  const measure = options.measure ?? imageSize;
  let token: string | undefined;
  const access = async (): Promise<string> => {
    if (token !== undefined) return token;
    const body = new URLSearchParams({
      client_id: options.clientId,
      client_secret: options.clientSecret,
      refresh_token: options.refreshToken,
      grant_type: "refresh_token",
    });
    const response = await fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok)
      throw new Error(`Google refused the refresh token (HTTP ${String(response.status)})`);
    token = tokenSchema.parse(parseJsonText(await response.text())).access_token;
    return token;
  };
  return {
    async list(): Promise<ScanRef[]> {
      const bearer = await access();
      const refs: ScanRef[] = [];
      let page: string | undefined;
      do {
        const url = new URL("https://www.googleapis.com/drive/v3/files");
        url.searchParams.set(
          "q",
          `'${options.folderId.replace(/'/g, "")}' in parents and trashed = false`,
        );
        url.searchParams.set("fields", "nextPageToken, files(id, name, mimeType)");
        url.searchParams.set("pageSize", "1000");
        url.searchParams.set("supportsAllDrives", "true");
        url.searchParams.set("includeItemsFromAllDrives", "true");
        if (page !== undefined) url.searchParams.set("pageToken", page);
        const response = await fetchFn(url, { headers: { authorization: `Bearer ${bearer}` } });
        if (!response.ok)
          throw new Error(`Drive refused the folder (HTTP ${String(response.status)})`);
        const listed = driveListSchema.parse(parseJsonText(await response.text()));
        for (const file of listed.files ?? []) {
          if (file.mimeType !== undefined && !file.mimeType.startsWith("image/")) continue;
          refs.push({
            name: file.name.replace(/\.[^.]+$/u, ""),
            url: `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`,
          });
        }
        page = listed.nextPageToken;
      } while (page !== undefined);
      refs.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
      return refs;
    },
    async open(ref: ScanRef): Promise<ScanFile> {
      const bearer = await access();
      const response = await fetchFn(ref.url, { headers: { authorization: `Bearer ${bearer}` } });
      if (!response.ok)
        throw new Error(`scan ${ref.name} answered HTTP ${String(response.status)}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { ...ref, bytes, ...measure(bytes) };
    },
  };
}

/** The folder id of a Drive folder URL, or the text itself when it is already an id. */
export function driveFolderId(value: string): string {
  const match = /\/folders\/([a-zA-Z0-9_-]+)/u.exec(value);
  if (match?.[1] !== undefined) return match[1];
  if (/^[a-zA-Z0-9_-]+$/u.test(value)) return value;
  throw new Error(`a Drive folder is its id or a folders/ URL: ${value}`);
}
