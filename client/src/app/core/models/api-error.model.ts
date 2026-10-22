// The one error shape of the API: { error: { code, message } }
export interface ApiErrorBody {
  error: {
    code: string; // for programs, e.g. CODE_NOT_FOUND
    message: string; // for people
  };
}
