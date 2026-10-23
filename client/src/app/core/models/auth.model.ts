// Answers of POST /api/student/otp/request and /otp/verify

export interface OtpRequestResponse {
  ok: boolean;
}

export interface OtpVerifyResponse {
  token: string;
  expiresIn: number; // seconds
}
