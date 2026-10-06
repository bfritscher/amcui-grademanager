import type {RequestHandler} from 'express';
import {z} from 'zod';
import {hasControlCharacters} from './paths.js';

const bytes = z
  .string()
  .min(1)
  .max(100_000)
  .regex(/^[A-Za-z0-9+/_=-]+$/);
const loginSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(200)
    .refine((value) => value.trim().length > 0 && !hasControlCharacters(value)),
  password: z.string().min(1).max(1024),
  authenticator: z
    .discriminatedUnion('type', [
      z.object({
        type: z.literal('authenticator'),
        token: z.string().regex(/^\d{6}$/),
      }),
      z.object({
        type: z.literal('fido2'),
        response: z.object({
          id: bytes,
          rawId: bytes,
          type: z.literal('public-key'),
          response: z.object({
            clientDataJSON: bytes,
            authenticatorData: bytes,
            signature: bytes,
            userHandle: z.string().max(100_000).nullable().optional(),
          }),
        }),
      }),
    ])
    .optional(),
});

export const validatePassword: RequestHandler = (req, res, next) => {
  if (
    typeof req.body?.password !== 'string' ||
    !req.body.password.length ||
    req.body.password.length > 1024
  ) {
    res.status(400).send('Invalid credentials');
    return;
  }
  next();
};

export const validatePasswordChange: RequestHandler = (req, res, next) => {
  const result = loginSchema
    .pick({username: true, password: true})
    .extend({newPassword: z.string().min(1).max(1024)})
    .safeParse(req.body);
  if (!result.success) {
    res.status(400).send('Invalid password change request');
    return;
  }
  req.body = result.data;
  next();
};

export const validateLogin: RequestHandler = (req, res, next) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).send('Invalid login request');
    return;
  }
  req.body = result.data;
  next();
};

// Express 4 does not forward rejected async handlers to its error middleware.
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}
