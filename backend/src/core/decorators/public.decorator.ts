import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public, bypassing the global JwtAuthGuard.
 * Use sparingly — only for login and health.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
