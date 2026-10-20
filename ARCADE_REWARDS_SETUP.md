# KHELOGO Arcade Rewards — Deployment Notes

## What this adds

- Signed-in Firebase users can start a server-created arcade session.
- A session must be at least 30 seconds old before it can be claimed.
- The backend adds **1 participation game coin** to `users/{uid}.gameCoins` through a Firebase Realtime Database transaction.
- Limits: one reward per game per UTC day and at most 5 arcade reward coins per UTC day.
- Duplicate claims do not add duplicate coins.
- The browser never writes the wallet balance directly.

**Important:** this is a capped participation reward, not a prize for winning. Game scores are still client-side and are not trusted as proof of a win. Do not advertise cash/UPI redemption for these browser rewards unless a separate compliant, server-validated reward and payout system is built.

## Deploy the backend

GitHub Pages only hosts the website. The Firebase Functions backend must be deployed to project `khelogo-4daaf` once by the project owner.

From Google Cloud Shell (or a computer with Node.js 20 and Firebase CLI):

```bash
git clone https://github.com/anshmaurya5619/anshmaurya5619.github.io.git
cd anshmaurya5619.github.io
firebase login
firebase use khelogo-4daaf
cd functions
npm install
cd ..
firebase deploy --only functions --project khelogo-4daaf
```

If the repository is already cloned, skip `git clone` and `cd` into the existing project folder. If Firebase CLI is not installed, install it with `npm install -g firebase-tools`.

Firebase may require the project to use the **Blaze billing plan** to deploy Cloud Functions. Check the Firebase console before proceeding; do not enable billing unless you understand any potential charges.

## Verify after deployment

1. Open the KHELOGO website and sign in with an existing account that has a matching `users/{uid}` record.
2. Open one game and keep it open for at least 30 seconds.
3. Use **Claim 1 coin**. Confirm that `gameCoins` rises by exactly 1 in the account panel / Realtime Database.
4. Try claiming again for the same game that day; it should be rejected without adding coins.
5. Try a second game, then test the 5-coin daily cap.
6. Test with a signed-out browser; it must not receive coins.

If the account record is missing, the function intentionally refuses to change the wallet. Never change Realtime Database rules to allow browser clients to write `gameCoins` directly.
