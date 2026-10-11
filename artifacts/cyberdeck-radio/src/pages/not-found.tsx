/**
 * Fallback route for unknown paths.
 *
 *   unmatched route ──▶ NotFound ──▶ off-dial 404 card with a way home
 */

import { Link } from 'wouter';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="app not-found" data-testid="page-not-found">
      <section className="not-found__card" aria-labelledby="not-found-title">
        <div className="not-found__glyph" aria-hidden="true">
          <AlertCircle />
        </div>
        <p className="not-found__code">ERROR 404</p>
        <h1 className="not-found__title" id="not-found-title">
          Off the dial
        </h1>
        <p className="not-found__body">
          This frequency isn&rsquo;t broadcasting. The page you were looking for doesn&rsquo;t exist
          or has drifted out of range.
        </p>
        <Link href="/" className="not-found__cta" data-testid="link-not-found-home">
          Return to the receiver
        </Link>
      </section>
    </main>
  );
}
