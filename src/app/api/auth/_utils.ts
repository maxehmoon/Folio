function normalisedAuthPath(request: Pick<Request, "url">): string | null {
  try {
    return decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function isPublicOwnerRegistration(
  request: Pick<Request, "url">,
): boolean {
  const pathname = normalisedAuthPath(request);
  return pathname === null || pathname === "/api/auth/sign-up/email";
}

export function isEmailSignInRequest(
  request: Pick<Request, "url">,
): boolean {
  return normalisedAuthPath(request) === "/api/auth/sign-in/email";
}
