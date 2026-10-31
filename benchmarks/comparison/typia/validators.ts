// Source of typia-generated/validators.ts, regenerate with `npm run bench:typia` (typia needs its own compiler step).
import typia from 'typia';

import { User } from '../models';

export const isUser = typia.createIs<User>();
export const validateUser = typia.createValidate<User>();
export const stringifyUser = typia.json.createStringify<User>();
