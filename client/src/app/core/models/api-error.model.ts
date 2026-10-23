// The one error shape of the API: { error: { code, message } }
export interface ApiErrorBody {
  error: {
    code: string; // for programs, e.g. CODE_NOT_FOUND
    message: string; // for people
  };
}

// Reads error.error.code from a failed HttpClient call; null if the body has another shape
export function getApiErrorCode(error: unknown): string | null {
  const body = (error as { error?: Partial<ApiErrorBody> } | null)?.error;
  return body?.error?.code ?? null;
}
