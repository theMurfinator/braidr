import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

/**
 * Verify a Clerk session token from a Bearer header and return the user's email.
 * Returns null if the token is invalid or missing.
 */
export async function verifySession(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.error('Auth: missing or malformed Authorization header');
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const payload = await clerk.verifyToken(token, {
      authorizedParties: [
        'https://braidr-api.vercel.app',
        'http://localhost:3000',
      ],
    });
    const user = await clerk.users.getUser(payload.sub);
    const email = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId
    );
    return email?.emailAddress?.toLowerCase() || null;
  } catch (err: any) {
    console.error('Auth: Clerk token verification failed:', err.message);
    return null;
  }
}
