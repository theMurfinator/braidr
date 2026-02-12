import { createClerkClient } from '@clerk/backend';

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

/**
 * Verify a Clerk session token from a Bearer header and return the user's email.
 * Returns null if the token is invalid or missing.
 */
export async function verifySession(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const { sub: userId } = await clerk.verifyToken(token);
    const user = await clerk.users.getUser(userId);
    const email = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId
    );
    return email?.emailAddress?.toLowerCase() || null;
  } catch {
    return null;
  }
}
