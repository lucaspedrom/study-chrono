import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { StudySessionRecord } from "../types/session";
import {
  filterSubjectSuggestions,
  formatDateBR,
  formatSeconds,
  formatSessionRange,
} from "../utils/formatTime";
import { useModalFocusTrap } from "../utils/useModalFocusTrap";

const PAGE_SIZE = 100;

interface HistoryReportProps {
  sessions: StudySessionRecord[];
  subjects: string[];
  isCloseModalOpen?: boolean;
  initialEditingSession?: StudySessionRecord | null;
  initialDeletingSession?: StudySessionRecord | null;
  initialDetailsSession?: StudySessionRecord | null;
  onEditSession: (id: number, subject: string, topic: string) => Promise<void>;
  onDeleteSession: (id: number) => Promise<void>;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export const HistoryReport: React.FC<HistoryReportProps> = ({
  sessions,
  subjects,
  isCloseModalOpen = false,
  initialEditingSession = null,
  initialDeletingSession = null,
  initialDetailsSession = null,
  onEditSession,
  onDeleteSession,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [detailsSession, setDetailsSession] =
    useState<StudySessionRecord | null>(initialDetailsSession);

  const [editingSession, setEditingSession] =
    useState<StudySessionRecord | null>(initialEditingSession);
  const [editSubject, setEditSubject] = useState(
    initialEditingSession?.subject ?? "",
  );
  const [editTopic, setEditTopic] = useState(
    initialEditingSession?.topic ?? "",
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isEditSuggestionsOpen, setIsEditSuggestionsOpen] = useState(false);
  const [editHighlightedIndex, setEditHighlightedIndex] = useState(-1);

  const [deletingSession, setDeletingSession] =
    useState<StudySessionRecord | null>(initialDeletingSession);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const detailsDialogRef = useRef<HTMLDivElement | null>(null);
  const detailsCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const editDialogRef = useRef<HTMLDivElement | null>(null);
  const editSubjectInputRef = useRef<HTMLInputElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useModalFocusTrap(
    Boolean(detailsSession) && !isCloseModalOpen,
    detailsDialogRef,
    detailsCloseButtonRef,
  );
  useModalFocusTrap(
    Boolean(editingSession) && !isCloseModalOpen,
    editDialogRef,
    editSubjectInputRef,
  );
  useModalFocusTrap(
    Boolean(deletingSession) && !isCloseModalOpen,
    deleteDialogRef,
    deleteCancelButtonRef,
  );

  const availableSubjects = useMemo(() => {
    const distinct = Array.from(
      new Set(sessions.map((s) => s.subject).filter(Boolean)),
    );
    return distinct.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [sessions]);

  const effectiveSubjectFilter =
    subjectFilter !== "ALL" && availableSubjects.includes(subjectFilter)
      ? subjectFilter
      : "ALL";

  useEffect(() => {
    if (subjectFilter !== "ALL" && !availableSubjects.includes(subjectFilter)) {
      setSubjectFilter("ALL");
    }
  }, [subjectFilter, availableSubjects]);

  useEffect(() => {
    if (
      (!editingSession && !deletingSession && !detailsSession) ||
      isCloseModalOpen
    )
      return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (detailsSession) {
        setDetailsSession(null);
      } else if (deletingSession && !isDeleting) {
        setDeletingSession(null);
        setDeleteError(null);
      } else if (editingSession && !isSavingEdit) {
        setIsEditSuggestionsOpen(false);
        setEditHighlightedIndex(-1);
        setEditingSession(null);
        setEditError(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    detailsSession,
    editingSession,
    deletingSession,
    isSavingEdit,
    isDeleting,
    isCloseModalOpen,
  ]);

  const filteredSessions = useMemo(() => {
    const normQuery = normalizeText(searchQuery);
    return sessions.filter((session) => {
      if (
        effectiveSubjectFilter !== "ALL" &&
        session.subject !== effectiveSubjectFilter
      ) {
        return false;
      }
      if (dateFilter && session.studyDate !== dateFilter) {
        return false;
      }
      if (normQuery) {
        const matchSubject = normalizeText(session.subject).includes(normQuery);
        const matchTopic = normalizeText(session.topic).includes(normQuery);
        if (!matchSubject && !matchTopic) {
          return false;
        }
      }
      return true;
    });
  }, [sessions, effectiveSubjectFilter, dateFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedSessions = useMemo(() => {
    if (filteredSessions.length <= PAGE_SIZE) {
      return filteredSessions;
    }
    const startIdx = (safePage - 1) * PAGE_SIZE;
    return filteredSessions.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredSessions, safePage]);

  const totals = useMemo(() => {
    return filteredSessions.reduce(
      (acc, s) => {
        acc.reading += s.timeReadingSec;
        acc.media += s.timeMediaSec;
        acc.review += s.timeReviewSec;
        acc.questions += s.timeQuestionsSec;
        acc.paused += s.timePausedSec;
        acc.active += s.totalActiveSec;
        return acc;
      },
      { reading: 0, media: 0, review: 0, questions: 0, paused: 0, active: 0 },
    );
  }, [filteredSessions]);

  const editSuggestions = useMemo(
    () => filterSubjectSuggestions(subjects, editSubject),
    [subjects, editSubject],
  );

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    effectiveSubjectFilter !== "ALL" ||
    dateFilter !== "";

  const openEditModal = (session: StudySessionRecord) => {
    setEditingSession(session);
    setEditSubject(session.subject);
    setEditTopic(session.topic);
    setEditError(null);
    setIsEditSuggestionsOpen(false);
    setEditHighlightedIndex(-1);
  };

  const closeEditModal = () => {
    setIsEditSuggestionsOpen(false);
    setEditHighlightedIndex(-1);
    setEditingSession(null);
    setEditError(null);
  };

  const selectEditSuggestion = (selected: string) => {
    setEditSubject(selected);
    setEditError(null);
    setIsEditSuggestionsOpen(false);
    setEditHighlightedIndex(-1);
  };

  const handleEditSubjectKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (!isEditSuggestionsOpen || editSuggestions.length === 0) {
      if (e.key === "ArrowDown" && editSuggestions.length > 0) {
        e.preventDefault();
        setIsEditSuggestionsOpen(true);
        setEditHighlightedIndex(0);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setEditHighlightedIndex((prev) => (prev + 1) % editSuggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setEditHighlightedIndex((prev) =>
        prev <= 0 ? editSuggestions.length - 1 : prev - 1,
      );
    } else if (e.key === "Enter") {
      if (
        editHighlightedIndex >= 0 &&
        editHighlightedIndex < editSuggestions.length
      ) {
        e.preventDefault();
        selectEditSuggestion(editSuggestions[editHighlightedIndex]);
      } else {
        setIsEditSuggestionsOpen(false);
        setEditHighlightedIndex(-1);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsEditSuggestionsOpen(false);
      setEditHighlightedIndex(-1);
    }
  };

  const handleSubmitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession || isSavingEdit) return;

    const cleanSubject = editSubject.trim();
    if (!cleanSubject) {
      setEditError("Informe a matéria para salvar as alterações.");
      editSubjectInputRef.current?.focus();
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    setIsEditSuggestionsOpen(false);
    try {
      await onEditSession(editingSession.id, cleanSubject, editTopic.trim());
      setEditingSession(null);
    } catch (err) {
      setEditError(String(err));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const openDeleteModal = (session: StudySessionRecord) => {
    setDeletingSession(session);
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingSession || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteSession(deletingSession.id);
      setDeletingSession(null);
    } catch (err) {
      setDeleteError(String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const pageRangeStart = (safePage - 1) * PAGE_SIZE + 1;
  const pageRangeEnd = Math.min(safePage * PAGE_SIZE, filteredSessions.length);

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3.5">
      {/* Cabeçalho de Relatório + Filtros */}
      <section className="rounded-xl border border-neutral-300 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="font-serif text-xl font-normal tracking-[-0.015em] text-neutral-950 dark:text-neutral-100">
              Relatório de Estudos Realizados
            </h2>
            <span className="tabular-clock font-mono rounded-full border border-neutral-300 bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {filteredSessions.length}{" "}
              {filteredSessions.length === 1 ? "registro" : "registros"}
            </span>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSubjectFilter("ALL");
                setDateFilter("");
                setCurrentPage(1);
              }}
              className="font-mono inline-flex cursor-pointer items-center gap-1 rounded-md border border-neutral-300 bg-neutral-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-700 transition-colors hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              <X className="h-3 w-3" />
              Limpar filtros
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
            <input
              id="history-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar matéria ou tópico..."
              aria-label="Buscar matéria ou tópico"
              className="font-sans select-text h-8 w-full rounded-lg border border-neutral-300 bg-neutral-50 pl-8 pr-3 text-xs text-neutral-950 placeholder:text-neutral-400 focus:border-neutral-950 focus:outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-200"
            />
          </div>

          <div className="relative">
            <select
              id="history-subject-filter"
              aria-label="Filtrar por matéria"
              value={effectiveSubjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="font-sans h-8 w-full appearance-none rounded-lg border border-neutral-300 bg-neutral-50 pl-3 pr-9 text-xs text-neutral-950 cursor-pointer focus:border-neutral-950 focus:outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-200"
            >
              <option value="ALL">Todas as matérias</option>
              {availableSubjects.map((subj) => (
                <option key={subj} value={subj}>
                  {subj}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-500 dark:text-neutral-400">
              <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            </div>
          </div>

          <div className="relative">
            <input
              id="history-date-filter"
              type="date"
              aria-label="Filtrar por data"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="tabular-clock font-mono h-8 w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 text-xs text-neutral-950 cursor-pointer focus:border-neutral-950 focus:outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-neutral-200"
            />
          </div>
        </div>

        {/* Resumo Consolidado do Relatório */}
        <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <div className="rounded-lg border border-neutral-900 bg-neutral-900 px-2.5 py-2 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950">
            <span className="font-mono block text-[10px] font-medium uppercase tracking-[0.04em] whitespace-nowrap opacity-80">
              Total Líquido
            </span>
            <span className="tabular-clock font-mono text-sm font-medium tabular-nums">
              {formatSeconds(totals.active)}
            </span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-950">
            <span className="font-mono block text-[10px] font-medium uppercase tracking-[0.04em] whitespace-nowrap text-neutral-500 dark:text-neutral-400">
              Leitura
            </span>
            <span className="tabular-clock font-mono text-sm font-medium text-neutral-900 tabular-nums dark:text-neutral-100">
              {formatSeconds(totals.reading)}
            </span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-950">
            <span className="font-mono block text-[10px] font-medium uppercase tracking-[0.04em] whitespace-nowrap text-neutral-500 dark:text-neutral-400">
              Videoaula
            </span>
            <span className="tabular-clock font-mono text-sm font-medium text-neutral-900 tabular-nums dark:text-neutral-100">
              {formatSeconds(totals.media)}
            </span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-950">
            <span className="font-mono block text-[10px] font-medium uppercase tracking-[0.04em] whitespace-nowrap text-neutral-500 dark:text-neutral-400">
              Revisão
            </span>
            <span className="tabular-clock font-mono text-sm font-medium text-neutral-900 tabular-nums dark:text-neutral-100">
              {formatSeconds(totals.review)}
            </span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-950">
            <span className="font-mono block text-[10px] font-medium uppercase tracking-[0.04em] whitespace-nowrap text-neutral-500 dark:text-neutral-400">
              Questões
            </span>
            <span className="tabular-clock font-mono text-sm font-medium text-neutral-900 tabular-nums dark:text-neutral-100">
              {formatSeconds(totals.questions)}
            </span>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-950">
            <span className="font-mono block text-[10px] font-medium uppercase tracking-[0.04em] whitespace-nowrap text-neutral-500 dark:text-neutral-400">
              Pausas
            </span>
            <span className="tabular-clock font-mono text-sm font-medium text-neutral-700 tabular-nums dark:text-neutral-300">
              {formatSeconds(totals.paused)}
            </span>
          </div>
        </div>
      </section>

      {/* Tabela de Registros */}
      <section className="flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-300 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {filteredSessions.length === 0 ? (
          <div className="font-sans flex flex-1 items-center justify-center px-4 py-10 text-sm text-neutral-500 dark:text-neutral-400">
            {sessions.length === 0
              ? "Nenhum registro de estudo encontrado no histórico."
              : "Nenhum registro corresponde aos filtros selecionados."}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-x-auto overflow-y-auto">
              <table className="w-full table-fixed border-collapse text-left text-xs">
                <colgroup></colgroup>
                <thead className="font-mono sticky top-0 z-10 border-b border-neutral-300 bg-neutral-100 text-[10px] font-medium uppercase tracking-[0.02em] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
                  <tr>
                    <th className="w-[84px] sm:w-[92px] md:w-[110px] py-2.5 pl-3 pr-1 text-left whitespace-nowrap">
                      Data
                    </th>
                    <th className="py-2.5 px-2 text-left truncate whitespace-nowrap">
                      Matéria
                    </th>
                    <th className="hidden md:table-cell py-2.5 px-2 text-left truncate whitespace-nowrap">
                      <span className="hidden min-[880px]:inline">
                        Conteúdo /{" "}
                      </span>
                      Tópico
                    </th>
                    <th className="hidden md:table-cell md:w-[60px] py-2.5 px-1 text-right whitespace-nowrap">
                      Leit.
                    </th>
                    <th className="hidden md:table-cell md:w-[60px] py-2.5 px-1 text-right whitespace-nowrap">
                      Vídeo
                    </th>
                    <th className="hidden md:table-cell md:w-[60px] py-2.5 px-1 text-right whitespace-nowrap">
                      Rev.
                    </th>
                    <th className="hidden md:table-cell md:w-[60px] py-2.5 px-1 text-right whitespace-nowrap">
                      Quest.
                    </th>
                    <th className="w-[62px] md:w-[64px] py-2.5 px-1 text-right whitespace-nowrap">
                      Tempo
                    </th>
                    <th className="w-[116px] sm:w-[124px] md:w-[210px] py-2.5 pl-1 pr-4 md:pr-6 text-right whitespace-nowrap">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800/80">
                  {paginatedSessions.map((session) => (
                    <tr
                      key={session.id}
                      data-session-id={session.id}
                      className="transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/40"
                    >
                      <td className="w-[84px] sm:w-[92px] md:w-[110px] tabular-clock font-mono py-2.5 pl-3 pr-1 text-[10.5px] text-neutral-600 tabular-nums whitespace-nowrap dark:text-neutral-400">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-neutral-900 dark:text-neutral-200">
                              {formatDateBR(session.studyDate)}
                            </span>
                            {session.status === "RECOVERED" && (
                              <span
                                title="Sessão recuperada automaticamente após encerramento inesperado"
                                className="font-mono rounded border border-neutral-400 bg-neutral-200 px-1 py-0 text-[8.5px] font-medium uppercase leading-tight tracking-normal text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                              >
                                Rec.
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-neutral-500 dark:text-neutral-500">
                            {formatSessionRange(
                              session.startTime,
                              session.endTime,
                            )}
                          </span>
                        </div>
                      </td>
                      <td
                        title={session.subject}
                        className="font-sans truncate px-2 py-2.5 text-xs font-semibold text-neutral-950 dark:text-neutral-100"
                      >
                        {session.subject}
                      </td>
                      <td
                        title={session.topic || "—"}
                        className="hidden md:table-cell font-sans truncate px-2 py-2.5 text-xs text-neutral-600 dark:text-neutral-400"
                      >
                        {session.topic || "—"}
                      </td>
                      <td className="hidden md:table-cell tabular-clock font-mono px-1 py-2.5 text-right text-[10.5px] text-neutral-600 tabular-nums whitespace-nowrap dark:text-neutral-400">
                        {formatSeconds(session.timeReadingSec)}
                      </td>
                      <td className="hidden md:table-cell tabular-clock font-mono px-1 py-2.5 text-right text-[10.5px] text-neutral-600 tabular-nums whitespace-nowrap dark:text-neutral-400">
                        {formatSeconds(session.timeMediaSec)}
                      </td>
                      <td className="hidden md:table-cell tabular-clock font-mono px-1 py-2.5 text-right text-[10.5px] text-neutral-600 tabular-nums whitespace-nowrap dark:text-neutral-400">
                        {formatSeconds(session.timeReviewSec)}
                      </td>
                      <td className="hidden md:table-cell tabular-clock font-mono px-1 py-2.5 text-right text-[10.5px] text-neutral-600 tabular-nums whitespace-nowrap dark:text-neutral-400">
                        {formatSeconds(session.timeQuestionsSec)}
                      </td>
                      <td className="w-[62px] md:w-[64px] tabular-clock font-mono px-1 py-2.5 text-right text-[10.5px] font-medium text-black tabular-nums whitespace-nowrap dark:text-white">
                        {formatSeconds(session.totalActiveSec)}
                      </td>
                      <td className="w-[116px] sm:w-[124px] md:w-[210px] py-2.5 pl-1 pr-4 md:pr-6 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDetailsSession(session)}
                            aria-label={`Ver detalhes do registro de ${session.subject}`}
                            title="Ver detalhes completos"
                            className="font-mono inline-flex md:hidden h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-neutral-300 bg-neutral-50 p-1 text-neutral-700 transition-colors hover:border-neutral-600 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
                          >
                            <Eye className="h-3.5 w-3.5 shrink-0" />
                            <span className="sr-only">Detalhes</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(session)}
                            aria-label={`Editar registro de ${session.subject}`}
                            title="Editar matéria e tópico"
                            className="font-mono inline-flex h-7 w-7 md:w-auto shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-neutral-300 bg-neutral-50 p-1 md:px-2 md:py-1 text-[10px] font-medium uppercase tracking-[0.02em] text-neutral-800 transition-colors hover:border-neutral-600 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:border-neutral-500 dark:hover:bg-neutral-800"
                          >
                            <Pencil className="h-3.5 w-3.5 shrink-0" />
                            <span className="hidden md:inline">Editar</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDeleteModal(session)}
                            aria-label={`Excluir registro de ${session.subject}`}
                            title="Excluir registro"
                            className="font-mono inline-flex h-7 w-7 md:w-auto shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-neutral-300 bg-neutral-50 p-1 md:px-2 md:py-1 text-[10px] font-medium uppercase tracking-[0.02em] text-neutral-800 transition-colors hover:border-neutral-900 hover:bg-neutral-900 hover:text-white dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:border-neutral-100 dark:hover:bg-neutral-100 dark:hover:text-neutral-950"
                          >
                            <Trash2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="hidden md:inline">Excluir</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredSessions.length > PAGE_SIZE && (
              <div className="font-mono flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-[11px] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
                <span className="tabular-clock tabular-nums">
                  Exibindo{" "}
                  <strong className="font-medium text-neutral-900 dark:text-neutral-200">
                    {pageRangeStart}–{pageRangeEnd}
                  </strong>{" "}
                  de{" "}
                  <strong className="font-medium text-neutral-900 dark:text-neutral-200">
                    {filteredSessions.length}
                  </strong>{" "}
                  registros
                </span>
                <div className="inline-flex items-center gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    aria-label="Página anterior"
                    onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                    className="font-mono inline-flex cursor-pointer items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-800 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                  </button>
                  <span className="tabular-clock font-mono font-medium text-neutral-800 tabular-nums dark:text-neutral-200">
                    Página {safePage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    aria-label="Próxima página"
                    onClick={() =>
                      setCurrentPage(Math.min(totalPages, safePage + 1))
                    }
                    className="font-mono inline-flex cursor-pointer items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] text-neutral-800 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  >
                    Próxima
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Caixa Flutuante com Detalhes Completos da Sessão (Responsividade) */}
      {detailsSession && (
        <div
          ref={detailsDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal={!isCloseModalOpen}
          aria-hidden={isCloseModalOpen ? "true" : undefined}
          aria-labelledby="session-details-modal-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs select-none dark:bg-black/75 animate-in fade-in duration-100"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailsSession(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-neutral-300 bg-white p-5 shadow-2xl shadow-black/30 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/80">
            {/* Cabeçalho */}
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-3 dark:border-neutral-800">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3
                    id="session-details-modal-title"
                    className="font-serif text-lg font-normal tracking-[-0.015em] text-neutral-950 dark:text-neutral-100 truncate"
                  >
                    Detalhes do Estudo
                  </h3>
                  {detailsSession.status === "RECOVERED" && (
                    <span
                      title="Sessão recuperada automaticamente após encerramento inesperado"
                      className="font-mono rounded border border-neutral-400 bg-neutral-200 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                    >
                      Recuperada
                    </span>
                  )}
                </div>
                <p className="font-mono mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                  {formatDateBR(detailsSession.studyDate)} •{" "}
                  {formatSessionRange(
                    detailsSession.startTime,
                    detailsSession.endTime,
                  )}
                </p>
              </div>

              <button
                ref={detailsCloseButtonRef}
                type="button"
                aria-label="Fechar detalhes"
                onClick={() => setDetailsSession(null)}
                className="cursor-pointer rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Corpo com Informações que foram ocultadas */}
            <div className="mt-4 space-y-3.5">
              {/* Matéria e Tópico */}
              <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-950/40">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Matéria / Conteúdo
                </div>
                <div className="font-sans mt-0.5 text-sm font-semibold text-neutral-950 dark:text-neutral-100">
                  {detailsSession.subject}
                </div>
                <div className="font-sans mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                  {detailsSession.topic ? (
                    <span>Tópico: {detailsSession.topic}</span>
                  ) : (
                    <span className="italic text-neutral-400 dark:text-neutral-500">
                      Nenhum tópico informado
                    </span>
                  )}
                </div>
              </div>

              {/* Tempo Total Líquido */}
              <div className="flex items-center justify-between rounded-lg border border-neutral-900 bg-neutral-900 px-3.5 py-2.5 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950">
                <span className="font-mono text-xs font-medium uppercase tracking-wider">
                  Tempo Líquido Total
                </span>
                <span className="tabular-clock font-mono text-base font-semibold tabular-nums">
                  {formatSeconds(detailsSession.totalActiveSec)}
                </span>
              </div>

              {/* Distribuição por Modalidade (Leitura, Vídeo, Revisão, Questões) */}
              <div>
                <span className="font-mono mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  Tempo por Modalidade
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                    <span className="font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                      Leitura
                    </span>
                    <span className="tabular-clock font-mono text-xs font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                      {formatSeconds(detailsSession.timeReadingSec)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                    <span className="font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                      Videoaula
                    </span>
                    <span className="tabular-clock font-mono text-xs font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                      {formatSeconds(detailsSession.timeMediaSec)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                    <span className="font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                      Revisão
                    </span>
                    <span className="tabular-clock font-mono text-xs font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                      {formatSeconds(detailsSession.timeReviewSec)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-950">
                    <span className="font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                      Questões
                    </span>
                    <span className="tabular-clock font-mono text-xs font-medium text-neutral-900 dark:text-neutral-100 tabular-nums">
                      {formatSeconds(detailsSession.timeQuestionsSec)}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between rounded-lg border border-neutral-200/80 bg-neutral-50/60 px-2.5 py-1.5 text-neutral-500 dark:border-neutral-800/80 dark:bg-neutral-950/60 dark:text-neutral-400">
                  <span className="font-mono text-[10.5px]">
                    Intervalos / Pausas
                  </span>
                  <span className="tabular-clock font-mono text-[11px] tabular-nums">
                    {formatSeconds(detailsSession.timePausedSec)}
                  </span>
                </div>
              </div>
            </div>

            {/* Rodapé com Ações */}
            <div className="mt-5 flex items-center justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  const toEdit = detailsSession;
                  setDetailsSession(null);
                  openEditModal(toEdit);
                }}
                className="font-mono inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-neutral-800 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>

              <button
                type="button"
                onClick={() => setDetailsSession(null)}
                className="font-mono cursor-pointer rounded-lg border border-neutral-950 bg-neutral-950 px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-white transition-colors hover:bg-neutral-800 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Edição de Matéria e Tópico */}
      {editingSession && (
        <div
          ref={editDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal={!isCloseModalOpen}
          aria-hidden={isCloseModalOpen ? "true" : undefined}
          aria-labelledby="edit-session-modal-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs dark:bg-black/75"
        >
          <form
            onSubmit={handleSubmitEdit}
            className="w-full max-w-md rounded-xl border border-neutral-300 bg-white p-5 shadow-2xl shadow-black/30 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/80"
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id="edit-session-modal-title"
                className="font-serif text-xl font-normal tracking-[-0.015em] text-neutral-950 dark:text-neutral-100"
              >
                Editar Registro de Estudo
              </h3>
              <button
                type="button"
                disabled={isSavingEdit}
                aria-label="Fechar modal de edição"
                onClick={closeEditModal}
                className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="tabular-clock font-mono mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              {formatDateBR(editingSession.studyDate)} •{" "}
              {formatSessionRange(
                editingSession.startTime,
                editingSession.endTime,
              )}{" "}
              • Tempo líquido: {formatSeconds(editingSession.totalActiveSec)}
            </p>

            <div className="mt-4 space-y-3">
              <div className="relative">
                <label
                  htmlFor="edit-subject-input"
                  className="font-mono mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400"
                >
                  Matéria{" "}
                  <span className="text-neutral-950 dark:text-neutral-100">
                    *
                  </span>
                </label>
                <input
                  ref={editSubjectInputRef}
                  id="edit-subject-input"
                  type="text"
                  autoComplete="off"
                  value={editSubject}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setEditSubject(nextVal);
                    setIsEditSuggestionsOpen(true);
                    setEditHighlightedIndex(-1);
                    if (nextVal.trim()) {
                      setEditError(null);
                    }
                  }}
                  onBlur={() => {
                    setIsEditSuggestionsOpen(false);
                    setEditHighlightedIndex(-1);
                  }}
                  onKeyDown={handleEditSubjectKeyDown}
                  aria-invalid={Boolean(editError)}
                  className={`font-sans select-text w-full rounded-lg border bg-neutral-50 px-3 py-2 text-sm text-neutral-950 focus:outline-none dark:bg-neutral-950 dark:text-neutral-100 ${
                    editError
                      ? "border-neutral-950 ring-2 ring-neutral-950/15 dark:border-white dark:ring-white/20"
                      : "border-neutral-300 focus:border-neutral-950 dark:border-neutral-800 dark:focus:border-neutral-200"
                  }`}
                />
                {isEditSuggestionsOpen && editSuggestions.length > 0 && (
                  <ul
                    role="listbox"
                    onMouseDown={(e) => e.preventDefault()}
                    className="font-sans absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-neutral-300 bg-white py-1 shadow-xl shadow-black/15 dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-black/60"
                  >
                    {editSuggestions.map((item, idx) => (
                      <li
                        key={item}
                        role="option"
                        aria-selected={idx === editHighlightedIndex}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectEditSuggestion(item);
                        }}
                        onMouseEnter={() => setEditHighlightedIndex(idx)}
                        className={`cursor-pointer px-3 py-1.5 text-sm transition-colors ${
                          idx === editHighlightedIndex
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
                  htmlFor="edit-topic-input"
                  className="font-mono mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-600 dark:text-neutral-400"
                >
                  Conteúdo / Tópico
                </label>
                <input
                  id="edit-topic-input"
                  type="text"
                  autoComplete="off"
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                  placeholder="Ex: Controle de Constitucionalidade"
                  className="font-sans select-text w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm text-neutral-950 placeholder:text-neutral-400 focus:border-neutral-950 focus:outline-none dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-200"
                />
              </div>

              {editError && (
                <p className="font-sans text-xs font-medium italic text-neutral-900 dark:text-neutral-200">
                  {editError}
                </p>
              )}
            </div>

            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
              <button
                type="button"
                disabled={isSavingEdit}
                onClick={closeEditModal}
                className="font-mono cursor-pointer rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-800 transition-colors hover:bg-neutral-200 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSavingEdit}
                className="font-mono cursor-pointer rounded-lg border border-neutral-950 bg-neutral-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-white transition-colors hover:bg-neutral-800 disabled:opacity-50 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-300"
              >
                {isSavingEdit ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pop-up de Confirmação de Exclusão */}
      {deletingSession && (
        <div
          ref={deleteDialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal={!isCloseModalOpen}
          aria-hidden={isCloseModalOpen ? "true" : undefined}
          aria-labelledby="delete-confirm-modal-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs dark:bg-black/75"
        >
          <div className="w-full max-w-md rounded-xl border border-neutral-300 bg-white p-5 shadow-2xl shadow-black/30 dark:border-neutral-800 dark:bg-neutral-900 dark:shadow-black/80">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-lg border border-neutral-300 bg-neutral-100 p-2 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  id="delete-confirm-modal-title"
                  className="font-serif text-xl font-normal tracking-[-0.015em] text-neutral-950 dark:text-neutral-100"
                >
                  Confirmar Exclusão
                </h3>
                <p className="font-sans mt-1.5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                  Tem certeza de que deseja excluir permanentemente este registro
                  de estudo? Esta ação não poderá ser desfeita.
                </p>

                <div className="font-sans mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="font-semibold text-neutral-950 dark:text-neutral-100">
                    {deletingSession.subject}
                  </div>
                  {deletingSession.topic && (
                    <div className="mt-0.5 text-neutral-600 dark:text-neutral-400">
                      {deletingSession.topic}
                    </div>
                  )}
                  <div className="tabular-clock font-mono mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                    {formatDateBR(deletingSession.studyDate)} (
                    {formatSessionRange(
                      deletingSession.startTime,
                      deletingSession.endTime,
                    )}
                    ) • {formatSeconds(deletingSession.totalActiveSec)}
                  </div>
                </div>

                {deleteError && (
                  <p className="font-sans mt-2 text-xs font-medium italic text-neutral-900 dark:text-neutral-200">
                    {deleteError}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
              <button
                ref={deleteCancelButtonRef}
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setDeletingSession(null);
                  setDeleteError(null);
                }}
                className="font-mono cursor-pointer rounded-lg border border-neutral-300 bg-neutral-100 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-800 transition-colors hover:bg-neutral-200 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="font-mono cursor-pointer rounded-lg border border-neutral-950 bg-neutral-950 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-white transition-colors hover:bg-neutral-800 disabled:opacity-50 dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-neutral-300"
              >
                {isDeleting ? "Excluindo..." : "Confirmar Exclusão"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
