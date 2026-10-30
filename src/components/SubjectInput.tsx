import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { filterSubjectSuggestions } from "../utils/formatTime";

interface SubjectInputProps {
  subject: string;
  topic: string;
  subjects: string[];
  subjectError: string | null;
  subjectInputRef: React.RefObject<HTMLInputElement | null>;
  onSubjectChange: (value: string) => void;
  onTopicChange: (value: string) => void;
  onMetadataCommit: (nextSubject: string, nextTopic: string) => void;
}

export const SubjectInput: React.FC<SubjectInputProps> = ({
  subject,
  topic,
  subjects,
  subjectError,
  subjectInputRef,
  onSubjectChange,
  onTopicChange,
  onMetadataCommit,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [showAllOnToggle, setShowAllOnToggle] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = showAllOnToggle
    ? subjects.slice(0, 12)
    : filterSubjectSuggestions(subjects, subject);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowAllOnToggle(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectSuggestion = (selected: string) => {
    onSubjectChange(selected);
    setIsOpen(false);
    setShowAllOnToggle(false);
    setHighlightedIndex(-1);
    onMetadataCommit(selected, topic);
  };

  const handleSubjectKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "ArrowDown" && (suggestions.length > 0 || subjects.length > 0)) {
        if (suggestions.length === 0) {
          setShowAllOnToggle(true);
        }
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      } else if (e.key === "Enter") {
        setIsOpen(false);
        setShowAllOnToggle(false);
        setHighlightedIndex(-1);
        onMetadataCommit(subject, topic);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev <= 0 ? suggestions.length - 1 : prev - 1,
      );
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        selectSuggestion(suggestions[highlightedIndex]);
      } else {
        setIsOpen(false);
        setShowAllOnToggle(false);
        setHighlightedIndex(-1);
        onMetadataCommit(subject, topic);
      }
    } else if (e.key === "Escape") {
      e.stopPropagation();
      setIsOpen(false);
      setShowAllOnToggle(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 rounded-xl border border-neutral-300 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-900">
      <div ref={containerRef} className="relative">
        <label
          htmlFor="subject-input"
          className="font-mono mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400"
        >
          Matéria <span className="text-neutral-950 dark:text-neutral-100">*</span>
        </label>
        <div className="relative">
          <input
            ref={subjectInputRef}
            id="subject-input"
            type="text"
            autoComplete="off"
            value={subject}
            onFocus={() => {
              if (subjects.length > 0) {
                setIsOpen(true);
              }
            }}
            onChange={(e) => {
              const nextVal = e.target.value;
              setShowAllOnToggle(false);
              onSubjectChange(nextVal);
              setIsOpen(true);
              setHighlightedIndex(-1);
            }}
            onBlur={() => {
              setIsOpen(false);
              setShowAllOnToggle(false);
              setHighlightedIndex(-1);
              onMetadataCommit(subject, topic);
            }}
            onKeyDown={handleSubjectKeyDown}
            placeholder="Ex: Direito Constitucional"
            aria-invalid={Boolean(subjectError)}
            className={`font-sans select-text h-9 w-full rounded-lg border bg-neutral-50 px-3 pr-9 text-sm text-neutral-950 placeholder:text-neutral-400 transition-colors focus:outline-none dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 ${
              subjectError
                ? "border-neutral-950 ring-2 ring-neutral-950/15 dark:border-white dark:ring-white/20"
                : "border-neutral-300 focus:border-neutral-950 dark:border-neutral-800 dark:focus:border-neutral-200"
            }`}
          />
          {subjects.length > 0 && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Exibir matérias salvas"
              onMouseDown={(e) => {
                e.preventDefault();
                const nextOpen = !isOpen;
                setShowAllOnToggle(nextOpen);
                setIsOpen(nextOpen);
                setHighlightedIndex(-1);
                subjectInputRef.current?.focus();
              }}
              className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-2.5 text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-200"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>

        {subjectError && (
          <p className="font-sans mt-1.5 text-xs font-medium italic text-neutral-900 dark:text-neutral-200">
            {subjectError}
          </p>
        )}

        {isOpen && suggestions.length > 0 && (
          <ul
            role="listbox"
            onMouseDown={(e) => e.preventDefault()}
            className="font-sans absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-neutral-300 bg-white py-1 shadow-xl shadow-black/15 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/60"
          >
            {suggestions.map((item, idx) => (
              <li
                key={item}
                role="option"
                aria-selected={idx === highlightedIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(item);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`cursor-pointer px-3 py-1.5 text-sm transition-colors ${
                  idx === highlightedIndex
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-950"
                    : "text-neutral-800 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                }`}
              >
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <label
          htmlFor="topic-input"
          className="font-mono mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400"
        >
          Conteúdo / Tópico
        </label>
        <input
          id="topic-input"
          type="text"
          autoComplete="off"
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
          onBlur={() => onMetadataCommit(subject, topic)}
          placeholder="Ex: Controle de Constitucionalidade"
          className="font-sans select-text h-9 w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-950 placeholder:text-neutral-400 transition-colors focus:border-neutral-950 focus:outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-200"
        />
      </div>
    </section>
  );
};
