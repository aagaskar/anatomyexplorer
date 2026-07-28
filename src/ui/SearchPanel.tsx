import { useMemo } from 'react';

import { SEARCH_EXAMPLES, search, type SearchResult } from '../anatomy/search';

interface SearchPanelProps {
  query: string;
  activeKey: string | null;
  onQueryChange: (query: string) => void;
  onPick: (result: SearchResult) => void;
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="6.8" cy="6.8" r="4.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function SearchPanel({ query, activeKey, onQueryChange, onPick }: SearchPanelProps) {
  const results = useMemo(() => search(query), [query]);

  return (
    <>
      <div className="section">
        <h2>Search the atlas</h2>
        <div className="searchbox">
          <SearchIcon />
          <input
            value={query}
            placeholder="Muscle, bone, nerve, motion or exercise"
            onChange={(e) => onQueryChange(e.target.value)}
            autoFocus
            spellCheck={false}
          />
        </div>
        <p className="faint" style={{ marginTop: 8, marginBottom: 0 }}>
          Search by structure, by a joint motion like “hip abduction” to light up everything that
          produces it, or by an exercise name to see what it works.
        </p>
      </div>

      {query.trim().length < 2 ? (
        <div className="section">
          <h2>Try</h2>
          <div className="chiprow">
            {SEARCH_EXAMPLES.map((example) => (
              <button key={example} className="chip" onClick={() => onQueryChange(example)}>
                {example}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="section">
          <h2>
            {results.length} result{results.length === 1 ? '' : 's'}
          </h2>
          {!results.length && (
            <p className="faint" style={{ margin: 0 }}>
              Nothing matched. Try a shorter term, the Latin name, or a lay term like “lats”.
            </p>
          )}
          <div className="results">
            {results.map((result) => (
              <button
                key={result.key}
                className="result"
                aria-pressed={activeKey === result.key}
                onClick={() => onPick(result)}
              >
                <span className="title">
                  <span className={`kindtag ${result.kind}`}>{result.kind}</span>
                  {result.title}
                </span>
                <span className="sub">{result.subtitle}</span>
                {result.detail && result.kind === 'exercise' && (
                  <span className="sub" style={{ marginTop: 3 }}>
                    {result.detail}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
