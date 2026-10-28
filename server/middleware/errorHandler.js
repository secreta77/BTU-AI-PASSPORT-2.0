// The last middleware of the app: every error leaves the API in one shape, { error: { code, message } } (docs/api.md).
//   AppError            -> its own code and status (a known, expected problem)
//   broken request body -> 400 INVALID_REQUEST
//   anything else       -> 500 INTERNAL_ERROR with a generic text. The details go to the server log only:
//                          they can contain SQL, file paths or keys, and the caller must never see them.
import { ERROR_CODE, HTTP_STATUS_BY_ERROR_CODE } from '../shared/constants.js';
import { AppError } from './appError.js';

const GENERIC_SERVER_MESSAGE = 'Something went wrong on the server';

// The permanent link token is a secret: it must not reach the server log, not even when the lookup itself fails.
const PUBLIC_TOKEN_IN_URL = /(\/api\/public\/passport\/)[^/?#]*/i;
export function hideSecretsInUrl(url) {
  return url.replace(PUBLIC_TOKEN_IN_URL, '$1:token');
}

// For a path that no route handles (wrong URL or wrong method). Put it after all routers.
export function notFoundHandler(req, res, next) {
  next(new AppError(ERROR_CODE.NOT_FOUND, `No such endpoint: ${req.method} ${req.path}`));
}

// `logError` is replaceable, so tests can read what was logged. Express knows an error middleware by its 4 arguments.
export function createErrorHandler(logError = console.error) {
  return function errorHandler(error, req, res, next) {
    if (res.headersSent) {
      return next(error); // the answer has already started; Express closes the connection
    }
    const answer = describeError(error);
    if (answer.status >= 500) {
      logError(`${req.method} ${hideSecretsInUrl(req.originalUrl)} failed:`, error);
    }
    return res.status(answer.status).json({ error: { code: answer.code, message: answer.message } });
  };
}

function describeError(error) {
  if (error instanceof AppError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  // express.json() marks its own errors with `type`: invalid JSON, body too large, unsupported encoding
  if (typeof error.type === 'string' && error.status >= 400 && error.status < 500) {
    const message = error.type === 'entity.parse.failed' ? 'The request body is not valid JSON' : 'The request body could not be read';
    return { status: HTTP_STATUS_BY_ERROR_CODE[ERROR_CODE.INVALID_REQUEST], code: ERROR_CODE.INVALID_REQUEST, message };
  }
  return {
    status: HTTP_STATUS_BY_ERROR_CODE[ERROR_CODE.INTERNAL_ERROR],
    code: ERROR_CODE.INTERNAL_ERROR,
    message: GENERIC_SERVER_MESSAGE,
  };
}
