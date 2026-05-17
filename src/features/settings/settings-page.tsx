import { Button } from "@/components/ui/button";
import { exportBackupToFile } from "@/features/backup/backup-export";
import {
  type BackupReminderFrequency,
  type Language,
  type Settings,
  type Theme,
  readSettings,
  writeSettings,
} from "@/lib/settings/settings";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { wipeAllData } from "./wipe";

/**
 * Settings v1 (issue #9). Five sections, in this order:
 *   1. Sprache      (de / en) — persisted only; live-switch deferred until
 *                   i18n infrastructure exists (see brief).
 *   2. Theme        (light / dark / system) — applied live via
 *                   `src/lib/settings/theme.ts`.
 *   3. Backup-Reminder-Frequenz — persisted only; the reminder trigger
 *                   itself is a separate issue.
 *   4. Speicher     (`navigator.storage.estimate()`) + "Backup jetzt
 *                   erstellen" stub button. This section is the deeplink
 *                   target from the ADR-0013 storage warning banners.
 *   5. Daten löschen — modal confirmation, then wipeAllData() and home.
 *
 * Items listed as "out of scope" in the triage brief (SM-2 tuning, custom
 * keyboard shortcuts, default session length, auto-show-back, sound /
 * haptics, sync / account settings) are deliberately absent from this UI.
 */
export function SettingsPage() {
  const [settings, setSettings] = useState<Settings>(() => readSettings());
  const [resetOpen, setResetOpen] = useState(false);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const next = writeSettings({ [key]: value } as Partial<Settings>);
    setSettings(next);
  };

  return (
    <section className="mx-auto max-w-xl space-y-8">
      <h2 className="text-lg font-medium">Einstellungen</h2>

      <LanguageSection
        value={settings.language}
        onChange={(v) => {
          update("language", v);
        }}
      />

      <ThemeSection
        value={settings.theme}
        onChange={(v) => {
          update("theme", v);
        }}
      />

      <BackupReminderSection
        value={settings.backupReminderFrequency}
        onChange={(v) => {
          update("backupReminderFrequency", v);
        }}
      />

      <StorageSection />

      <ResetSection onClick={() => setResetOpen(true)} />

      {resetOpen ? <ResetConfirmDialog onCancel={() => setResetOpen(false)} /> : null}
    </section>
  );
}

// --- 1. Sprache ------------------------------------------------------------

function LanguageSection({
  value,
  onChange,
}: {
  value: Language;
  onChange: (v: Language) => void;
}) {
  return (
    <SettingsBlock title="Sprache">
      <RadioGroup
        name="language"
        legend="Sprache"
        value={value}
        onChange={(v) => onChange(v as Language)}
        options={[
          { value: "de", label: "Deutsch" },
          { value: "en", label: "English" },
        ]}
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Die Sprachauswahl wird gespeichert. Die Live-Übersetzung der Oberfläche folgt, sobald die
        i18n-Infrastruktur ergänzt ist.
      </p>
    </SettingsBlock>
  );
}

// --- 2. Theme --------------------------------------------------------------

function ThemeSection({ value, onChange }: { value: Theme; onChange: (v: Theme) => void }) {
  return (
    <SettingsBlock title="Theme">
      <RadioGroup
        name="theme"
        legend="Theme"
        value={value}
        onChange={(v) => onChange(v as Theme)}
        options={[
          { value: "light", label: "Hell" },
          { value: "dark", label: "Dunkel" },
          { value: "system", label: "System" },
        ]}
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        „System" folgt der Einstellung deines Betriebssystems.
      </p>
    </SettingsBlock>
  );
}

// --- 3. Backup-Reminder-Frequenz ------------------------------------------

function BackupReminderSection({
  value,
  onChange,
}: {
  value: BackupReminderFrequency;
  onChange: (v: BackupReminderFrequency) => void;
}) {
  return (
    <SettingsBlock title="Backup-Erinnerung">
      <RadioGroup
        name="backup-reminder"
        legend="Backup-Erinnerung"
        value={value}
        onChange={(v) => onChange(v as BackupReminderFrequency)}
        options={[
          { value: "off", label: "Aus" },
          { value: "weekly", label: "Wöchentlich" },
          { value: "monthly", label: "Monatlich" },
        ]}
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Erinnert dich, gelegentlich ein Backup deiner Decks und Lerndaten zu erstellen.
      </p>
    </SettingsBlock>
  );
}

// --- 4. Speicher ----------------------------------------------------------

type StorageEstimateState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "ready"; usage: number; quota: number };

function StorageSection() {
  const [state, setState] = useState<StorageEstimateState>({ kind: "loading" });

  useEffect(() => {
    const supported =
      typeof navigator !== "undefined" &&
      navigator.storage &&
      typeof navigator.storage.estimate === "function";
    if (!supported) {
      setState({ kind: "unsupported" });
      return;
    }
    let cancelled = false;
    void navigator.storage.estimate().then((est) => {
      if (cancelled) return;
      setState({ kind: "ready", usage: est.usage ?? 0, quota: est.quota ?? 0 });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingsBlock title="Speicher" id="storage">
      {state.kind === "loading" ? (
        <p className="text-sm text-slate-500">Speicherbelegung wird ermittelt…</p>
      ) : state.kind === "unsupported" ? (
        <p className="text-sm text-slate-500">
          Dein Browser stellt keine Speicher-Auskunft bereit.
        </p>
      ) : (
        <StorageBar usage={state.usage} quota={state.quota} />
      )}
      <BackupActions />
    </SettingsBlock>
  );
}

function BackupActions() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await exportBackupToFile();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Backup wird erstellt…" : "Backup jetzt erstellen"}
      </Button>
      <Link to="/backup/import">
        <Button type="button" variant="outline">
          Backup importieren
        </Button>
      </Link>
    </div>
  );
}

function StorageBar({ usage, quota }: { usage: number; quota: number }) {
  const ratio = quota > 0 ? usage / quota : 0;
  const pct = Math.round(ratio * 100);
  return (
    <div className="space-y-1">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
        role="progressbar"
        aria-label="Speicherbelegung"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        tabIndex={0}
      >
        <div
          className="h-full bg-slate-700 dark:bg-slate-300"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        {formatMb(usage)} von {formatMb(quota)} ({pct} %)
      </p>
    </div>
  );
}

function formatMb(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  // Sub-megabyte values look silly as "0 MB"; show one decimal there only.
  return mb < 10 ? `${mb.toFixed(1)} MB` : `${Math.round(mb)} MB`;
}

// --- 5. Daten löschen -----------------------------------------------------

function ResetSection({ onClick }: { onClick: () => void }) {
  return (
    <SettingsBlock title="Daten löschen">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Setzt die App zurück: alle Decks, Cards und Lern-Fortschritte werden unwiderruflich
        gelöscht.
      </p>
      <Button type="button" variant="outline" onClick={onClick}>
        Alle Daten löschen…
      </Button>
    </SettingsBlock>
  );
}

function ResetConfirmDialog({ onCancel }: { onCancel: () => void }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, []);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await wipeAllData();
      // Navigate to the deck-list (the empty-state will surface itself).
      await navigate({ to: "/" });
    } finally {
      setBusy(false);
      onCancel();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      className="w-full max-w-sm space-y-3 rounded-md bg-white p-4 shadow-lg backdrop:bg-black/40 dark:bg-slate-900"
    >
      <h2 className="text-base font-medium">Alle Daten löschen?</h2>
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Alle Decks, Cards und Review-States werden unwiderruflich gelöscht. Diese Aktion lässt sich
        nicht rückgängig machen.
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Abbrechen
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={busy}>
          {busy ? "Lösche…" : "Endgültig löschen"}
        </Button>
      </div>
    </dialog>
  );
}

// --- shared atoms ---------------------------------------------------------

function SettingsBlock({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3" id={id}>
      <h3 className="text-sm font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function RadioGroup({
  name,
  legend,
  value,
  onChange,
  options,
}: {
  name: string;
  legend: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">{legend}</legend>
      {options.map((opt) => {
        const id = `${name}-${opt.value}`;
        const checked = value === opt.value;
        return (
          <label
            key={opt.value}
            htmlFor={id}
            className={
              checked
                ? "cursor-pointer rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-sm text-slate-50 dark:border-slate-50 dark:bg-slate-50 dark:text-slate-900"
                : "cursor-pointer rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800"
            }
          >
            <input
              id={id}
              type="radio"
              name={name}
              value={opt.value}
              checked={checked}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </fieldset>
  );
}
