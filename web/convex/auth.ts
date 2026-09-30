import { Password } from '@convex-dev/auth/providers/Password';
import { convexAuth } from '@convex-dev/auth/server';

/** Email and password, as before. New accounts start with no display name;
 *  the app asks for one before anything else. */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? '').trim().toLowerCase();
        if (!/\S+@\S+\.\S+/.test(email)) throw new Error('Enter a valid email address.');
        return { email, displayName: '', shareTrained: true, blurFace: false };
      },
    }),
  ],
});
