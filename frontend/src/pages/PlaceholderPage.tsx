import { Construction } from 'lucide-react';

type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <section className="placeholder-page" aria-label={title}>
      <Construction size={24} aria-hidden="true" />
      <div>
        <p className="eyebrow">Module Placeholder</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}
