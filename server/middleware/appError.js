// An error that the API answers on purpose: a known code and its HTTP status, e.g. new AppError(ERROR_CODE.INVALID_OTP, '...').
// The error middleware turns it into { error: { code, message } }. Any other error becomes INTERNAL_ERROR.
import { HTTP_STATUS_BY_ERROR_CODE } from '../shared/constants.js';

export class AppError extends Error {
  constructor(code, message) {
    super(message);
    const status = HTTP_STATUS_BY_ERROR_CODE[code];
    if (status === undefined) {
      throw new Error(`Unknown error code "${code}". Add it to ERROR_CODE in shared/constants.js.`);
    }
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}
