<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Decart AI: the API key stays server-side; `startLive` issues a short-lived client token and the browser connects with `@decartai/sdk` (model lucy-2.5). Why: never expose the key to users.
- Points are charged only in the database functions `start_live_session`/`bill_live_session`, based on elapsed time. Why: users cannot change their own balance.
- Avatar images sit in a private `avatars` bucket and are uploaded and signed through server functions. Why: no storage policies are needed and files stay private.
