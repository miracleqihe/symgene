import React from 'react';

export default function KineticTitle({
  as: Tag = 'h1',
  text,
  mode = 'converge',
  replayKey
}) {
  const characters = Array.from(String(text || ''));

  return (
    <Tag
      className={`kinetic-title kinetic-title-${mode}`}
      aria-label={text}
      data-replay-key={replayKey}
    >
      {characters.map((character, index) => (
        <span
          className="kinetic-character"
          aria-hidden="true"
          key={`${replayKey || text}-${index}-${character}`}
          style={{
            '--character-offset': `${characters.length > 1 ? (index / (characters.length - 1) - 0.5) * 0.42 : 0}em`
          }}
        >
          {character === ' ' ? '\u00A0' : character}
        </span>
      ))}
    </Tag>
  );
}
