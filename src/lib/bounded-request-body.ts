export class RequestBodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit.`);
    this.name = "RequestBodyTooLargeError";
  }
}

export class UnsupportedRequestMediaTypeError extends Error {
  constructor(contentType: string | null) {
    super(`Unsupported request media type: ${contentType ?? "missing"}.`);
    this.name = "UnsupportedRequestMediaTypeError";
  }
}

function declaredBodyLength(request: Request): number | null {
  const value = request.headers.get("content-length");
  if (value === null) return null;
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new RequestBodyTooLargeError(0);
  }

  const length = Number(value);
  if (!Number.isSafeInteger(length)) {
    throw new RequestBodyTooLargeError(0);
  }
  return length;
}

export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("maxBytes must be a positive safe integer.");
  }

  const declaredLength = declaredBodyLength(request);
  if (declaredLength !== null && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        // A cloned Request uses a tee'd stream. Waiting for cancellation can
        // wait on the untouched sibling branch indefinitely, so initiate the
        // cancellation and fail this branch immediately.
        void reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function readBoundedUrlEncodedBody(
  request: Request,
  maxBytes: number,
): Promise<URLSearchParams> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new UnsupportedRequestMediaTypeError(
      request.headers.get("content-type"),
    );
  }

  const body = await readBoundedRequestBody(request, maxBytes);
  return new URLSearchParams(new TextDecoder().decode(body));
}
