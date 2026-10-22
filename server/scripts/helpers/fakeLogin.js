// A fake login world for the tests: the otp_codes table, the students, a mailbox and a clock, all in memory.
// auth-test.js tests the login rules with it; api-test.js sends real HTTP requests through the real login code.
import { generateLoginCode } from '../../auth/otpService.js';
import { OTP } from '../../shared/constants.js';

const defaultStudents = [
  { studentId: 'BTU-T-0001', firstName: 'Giorgi', lastName: 'Kapanadze', email: 'Giorgi@Example.org' },
];

// world.deps is what requestOtp / verifyOtp take as their `deps` argument
export function createFakeLoginWorld(students = defaultStudents) {
  const world = {
    now: new Date('2026-10-22T10:00:00Z'),
    otps: [], // rows of otp_codes
    mails: [], // what the mail sender received
    errors: [], // what was logged
    mailFails: false,
    nextCode: null, // a fixed code for a scenario that needs to know it
  };
  let nextId = 1;

  world.deps = {
    db: {
      async findStudentByEmail(email) {
        return students.find((student) => student.email.toLowerCase() === email.toLowerCase()) ?? null;
      },
      async createOtp({ email, codeHash, expiresAt }) {
        world.otps.filter((otp) => otp.email === email && !otp.used).forEach((otp) => { otp.used = true; });
        world.otps.push({ id: nextId, email, codeHash, attempts: 0, expiresAt, used: false });
        return nextId++;
      },
      async findActiveOtp(email) {
        const otp = world.otps.filter((item) => item.email === email.toLowerCase() && !item.used).at(-1);
        return otp ? { id: otp.id, codeHash: otp.codeHash, attempts: otp.attempts, expiresAt: otp.expiresAt } : null;
      },
      async increaseOtpAttempts(id) {
        const otp = world.otps.find((item) => item.id === id);
        if (otp.attempts >= OTP.MAX_ATTEMPTS) return null;
        otp.attempts += 1;
        return otp.attempts;
      },
      async markOtpUsed(id) {
        const otp = world.otps.find((item) => item.id === id);
        if (otp.used) return false;
        otp.used = true;
        return true;
      },
    },
    async sendMail(mail) {
      if (world.mailFails) throw new Error('SMTP server is down');
      world.mails.push(mail);
    },
    generateCode: () => world.nextCode ?? generateLoginCode(),
    now: () => world.now,
    logError: (message) => world.errors.push(message),
  };
  return world;
}
