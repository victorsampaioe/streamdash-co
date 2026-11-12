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

- PIX confirmation must validate provider amount, internal reference and charge identity through the shared validator before activation; this prevents cross-account crediting.
- Recover unlinked PIX charges through the provider's exact external-reference search and reuse the internal payment ID as the provider idempotency key; this makes retries recoverable without guessing ownership.
- Use literal typed table names for generated database queries; casting relation names to any prevents correct select-result inference.
