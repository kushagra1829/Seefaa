import { pageMeta } from "@/lib/seo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowUpRight, Camera, CalendarClock, CheckCircle2, Circle, Flame, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PageHeader, Panel, Stat, Bar, Empty } from "@/components/seefaa/bits";
import { TimerStartButtons } from "@/components/seefaa/timer";
import { QuestionText } from "@/components/seefaa/question";
import { useAttempt, useCurriculum, useInvalidate, useProfile, useProgress, useXp } from "@/hooks/use-seefaa";
import { activeSeconds, daysBetween, fmtDate, fmtHours, isoDate, studyPhase, addDays } from "@/lib/cfa";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: z.object({ welcome: z.boolean().optional() }).passthrough(),
  head: () => ({ meta: pageMeta("Dashboard — SEEFAA", "Your CFA Level I day at a glance.") }),
  component: Dashboard,
});

function Dashboard() {
  const { welcome } = Route.useSearch();
  const { data: profile } = useProfile();
  const { data: attempt } = useAttempt();
  const { data: cur } = useCurriculum();
  const { data: prog } = useProgress();
  const { data: xp } = useXp();
  const inv = useInvalidate();
  const today = isoDate();

  const { data } = useQuery({
    queryKey: ["dashboard", attempt?.id, today],
    enabled: !!attempt,
    queryFn: async () => {
      if (!attempt) return { tasks: [], overdue: 0, revs: 0, mistakesDue: 0, timers: [], recent: [] };
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const [tasks, overdue, revs, mistakesDue, timers, recent] = await Promise.all([
        supabase.from("study_tasks").select("*").eq("attempt_id", attempt.id).eq("task_date", today).order("kind"),
        supabase.from("study_tasks").select("id", { count: "exact", head: true }).eq("attempt_id", attempt.id).eq("done", false).lt("task_date", today),
        supabase.from("revision_checkpoints").select("id", { count: "exact", head: true }).eq("attempt_id", attempt.id).is("completed_at", null).lte("due_date", today),
        supabase.from("mistakes").select("id", { count: "exact", head: true }).neq("mastery", "mastered").lte("next_review", today),
        supabase.from("timer_sessions").select("*").gte("started_at", startOfDay.toISOString()),
        supabase.from("mistakes").select("id, question, subject_id, created_at").order("created_at", { ascending: false }).limit(4),
      ]);
      return { tasks: tasks.data ?? [], overdue: overdue.count ?? 0, revs: revs.count ?? 0, mistakesDue: mistakesDue.count ?? 0, timers: timers.data ?? [], recent: recent.data ?? [] };
    },
  });

  if (!cur || !attempt || !prog) return <p className="text-muted-foreground">Loading…</p>;
  const totalModules = cur.modules.length;
  const doneModules = prog.modules.filter((m) => m.status === "completed").length;
  const pct = totalModules ? Math.round((doneModules / totalModules) * 100) : 0;
  const daysToExam = attempt.exam_date ? daysBetween(today, attempt.exam_date) : null;
  const daysToTarget = attempt.target_completion_date ? daysBetween(today, attempt.target_completion_date) : null;
  const studySecs = (data?.timers ?? []).filter((t) => t.kind === "study").reduce((a, t) => a + activeSeconds(t), 0);
  const revSecs = (data?.timers ?? []).filter((t) => t.kind === "revision").reduce((a, t) => a + activeSeconds(t), 0);

  // pace estimate
  const elapsed = Math.max(1, daysBetween(attempt.start_date, today));
  const perDay = doneModules / elapsed;
  const eta = perDay > 0 && doneModules < totalModules ? addDays(today, Math.ceil((totalModules - doneModules) / perDay)) : null;

  // streak from xp days
  const xpDays = new Set((xp?.rows ?? []).map((r) => isoDate(new Date(r.created_at))));
  (data?.timers ?? []).forEach((t) => xpDays.add(isoDate(new Date(t.started_at))));
  let streak = 0;
  for (let d = today; xpDays.has(d); d = addDays(d, -1)) streak++;

  const activeSubjects = prog.plans.filter((p) => p.status === "active").map((p) => cur.subject(p.subject_id)?.short_name).filter(Boolean);

  async function toggleTask(id: string, done: boolean) {
    await supabase.from("study_tasks").update({ done, completed_at: done ? new Date().toISOString() : null }).eq("id", id);
    inv("dashboard");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={`Hello${profile?.display_name ? `, ${profile.display_name}` : ""}. Let's make progress.`} subtitle={`Studying now: ${activeSubjects.join(" · ") || "—"}`} actions={<Button asChild variant="outline"><Link to="/plan">Your study plan <ArrowUpRight /></Link></Button>} />
      {welcome && (
        <div className="rounded-xl border border-primary/30 bg-accent p-4 text-sm">
          <b>Your plan is live.</b> Got a question wrong? Hit <b>Log a Mistake</b> and paste the screenshot. Mark modules done in <Link to="/curriculum" className="text-primary underline">CFA Curriculum</Link> and your revisions appear in the <Link to="/revision" className="text-primary underline">Revision Centre</Link>.
        </div>
      )}

      <div className="grid gap-6 border-b pb-6 lg:grid-cols-5">
        <section className="min-w-0 lg:col-span-3">
          <p className="mb-2 text-xs font-bold uppercase text-primary">Next up</p>
          <h2 className="mb-4 font-display text-xl font-bold leading-relaxed">{data?.tasks.find(t => !t.done)?.title || (data?.revs ? "Your due revisions are ready." : "Make room for your next concept.")}</h2>
          <TimerStartButtons />
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span>Study <b>{fmtHours(studySecs)}</b></span><span>Revision <b>{fmtHours(revSecs)}</b></span><span className="font-bold text-primary">{fmtHours(studySecs + revSecs)} total today</span>
          </div>
        </section>
        <section className="min-w-0 border-t pt-5 lg:col-span-2 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <p className="mb-3 text-xs font-bold uppercase text-muted-foreground">Overall preparation</p>
          <div className="mb-3 flex items-end justify-between gap-3"><span className="font-display text-4xl font-bold">{pct}%</span><span className="text-sm text-muted-foreground">{doneModules}/{totalModules} modules</span></div>
          <Bar value={pct} />
          <p className="mt-3 text-xs text-muted-foreground">{prog.modules.filter(m => m.status === "in_progress").length} in progress · {totalModules - prog.modules.filter(m => m.status === "completed" || m.status === "in_progress").length} not started</p>
          <p className="mt-3 text-xs text-muted-foreground">{cur.los.length ? `${prog.los.filter(l => l.status === "completed").length}/${cur.los.length} learning outcomes completed · ${prog.los.filter(l => l.status === "in_progress").length} in progress` : "Verified learning outcomes not yet available"}</p>
          <div className="mt-5 flex flex-wrap gap-3"><Button asChild size="sm" variant="outline"><Link to="/curriculum">View curriculum <ArrowUpRight /></Link></Button><Button asChild size="sm" variant="secondary"><Link to="/revision">{(data?.revs ?? 0) + (data?.mistakesDue ?? 0)} reviews due <RefreshCw /></Link></Button></div>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="deep" label="Exam countdown" value={daysToExam == null ? "No date" : daysToExam >= 0 ? `${daysToExam} days` : "Passed"} hint={attempt.exam_date ? fmtDate(attempt.exam_date) : "Add it in Settings"} />
        <Stat label="Preparation phase" value={studyPhase(daysToExam, pct)} hint={`${doneModules} modules completed`} />
        <Stat label="Target completion" value={daysToTarget == null ? "—" : `${daysToTarget} days`} hint={eta ? `At your pace: ${fmtDate(eta)}` : "Not enough data for an estimate"} />
        <Stat tone="sun" label="XP · streak" value={<span className="flex items-center gap-2">{xp?.total ?? 0}<Flame className="h-5 w-5" />{streak}</span>} hint="Days in a row with learning activity" />
      </div>

      <div className="grid gap-6 border-b pb-6 lg:grid-cols-5">
        <Panel title="Today's plan" className="lg:col-span-3" action={<Button asChild size="sm" variant="ghost"><Link to="/plan">Full plan</Link></Button>}>
          {data?.overdue ? <p className="mb-3 rounded-md bg-sun/25 px-3 py-2 text-xs"><CalendarClock className="mr-1 inline h-3.5 w-3.5" />{data.overdue} earlier task(s) still open — they're kept on your plan as catch-up.</p> : null}
          {!data?.tasks.length ? (
            <Empty title="Nothing planned today" action={<Button asChild variant="secondary"><Link to="/plan">Create or adjust your plan <ArrowUpRight /></Link></Button>} />
          ) : (
            <ul className="space-y-2">
              {data.tasks.map((t) => (
                <li key={t.id}>
                  <Button variant="ghost" onClick={() => toggleTask(t.id, !t.done)} className="grid h-auto w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-3 whitespace-normal rounded-lg border bg-card p-3 text-left hover:bg-muted">
                    {t.done ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                    <span className={cn("min-w-0 text-sm", t.done && "text-muted-foreground line-through")}>{t.title}<span className="mt-1 block text-[10px] font-medium uppercase text-primary">{t.kind}</span></span>
                    <span className="text-xs text-muted-foreground">{t.minutes}m</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Your next milestone" className="lg:col-span-2">
          <p className="text-sm leading-6">{attempt.exam_date ? `CFA exam · ${fmtDate(attempt.exam_date)}` : "Choose your CFA exam date."}</p>
          <p className="mt-2 text-sm text-muted-foreground">{attempt.target_completion_date ? `Curriculum target · ${fmtDate(attempt.target_completion_date)}` : "Set a curriculum completion target."}</p>
          <Button asChild variant="outline" size="sm" className="mt-5"><Link to="/settings">{attempt.exam_date ? "Update study preferences" : "Set exam date"} <ArrowUpRight /></Link></Button>
        </Panel>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/error-log" className="card-soft grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-5 transition hover:border-primary"><span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-primary"><Camera className="h-5 w-5" /></span><div className="min-w-0"><p className="font-display text-base font-bold">Turn a mistake into progress.</p><p className="mt-1 text-xs text-muted-foreground">Log a question and give it another chance.</p></div><ArrowUpRight className="h-5 w-5 text-primary" /></Link>
        <Link to="/revision" className="card-soft grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-5 transition hover:border-primary"><span className="grid h-11 w-11 place-items-center rounded-lg bg-accent text-primary"><RefreshCw className="h-5 w-5" /></span><div className="min-w-0"><p className="font-display text-base font-bold">Today's revision</p><p className="mt-1 text-xs text-muted-foreground">{(data?.revs ?? 0) + (data?.mistakesDue ?? 0)} reviews due · keep your knowledge fresh</p></div><ArrowUpRight className="h-5 w-5 text-primary" /></Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Subject progress">
          <div className="space-y-3">
            {cur.subjects.map((s) => {
              const mods = cur.modulesOf(s.id);
              const d = prog.modules.filter((m) => m.status === "completed" && mods.some((x) => x.id === m.module_id)).length;
              return (
                <Link key={s.id} to="/curriculum/$subjectId" params={{ subjectId: s.id }} className="block">
                  <div className="mb-1 flex justify-between text-sm"><span>{s.name}</span><span className="text-muted-foreground">{d}/{mods.length}</span></div>
                  <Bar value={(d / Math.max(1, mods.length)) * 100} />
                </Link>
              );
            })}
          </div>
        </Panel>
        <Panel title="Recent mistakes" action={<Button asChild size="sm" variant="ghost"><Link to="/mistakes">Mistake bank</Link></Button>}>
          {!data?.recent.length ? (
            <Empty icon={<Camera />} title="No mistakes logged yet" body="Every wrong answer is a lesson. Log your first one." action={<Button asChild size="sm"><Link to="/error-log">Log a Mistake</Link></Button>} />
          ) : (
            <ul className="space-y-2">
              {data.recent.map((m) => (
                <li key={m.id}>
                  <Link to="/mistakes/$id" params={{ id: m.id }} className="block rounded-lg border p-3 text-sm hover:bg-muted">
                    <QuestionText text={m.question} compact />
                    <span className="mt-1 block text-xs text-muted-foreground">{cur.subject(m.subject_id)?.short_name} · {fmtDate(m.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
