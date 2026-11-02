"use client";

import { motion, useReducedMotion } from "framer-motion";
import { formatReason } from "@/components/stylist/LookCheckCard";
import type { TodayFunnel } from "@/types";

function describeContext(context: TodayFunnel["context"]): string {
  if (!context) return "";
  const { occasion, temp_c, raining, walk_minutes, transport, weather_source, place } = context;
  const temperature = typeof temp_c === "number" ? `${Math.round(temp_c)}°C` : null;
  const rain = raining === true ? "rain" : raining === false ? "dry" : null;
  const weather = [temperature, rain].filter(Boolean).join(", ");
  const live = weather_source === "open-meteo" && place ? ` in ${place}, live` : "";
  const commute = typeof walk_minutes === "number" ? `${walk_minutes} min ${transport ?? "on foot"}` : transport;
  return [occasion?.replace(/_/g, " "), weather ? `${weather}${live}` : null, commute].filter(Boolean).join(" · ");
}

function StageBar({ share, delay }: { share: number; delay: number }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <div className="h-1 rounded-full bg-border/60 overflow-hidden mt-1.5" aria-hidden="true">
      <motion.div
        className="h-full rounded-full bg-ink origin-left"
        initial={shouldReduceMotion ? false : { scaleX: 1 }}
        animate={{ scaleX: share }}
        transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

export function TodayFunnelCard({ funnel }: { funnel: TodayFunnel }) {
  if (funnel.total_combos === 0) return null;

  const { checked_combos: checked, total_combos: total, survivor_count: survivors } = funnel;
  const context = describeContext(funnel.context);

  return (
    <section
      aria-label={`Closet check: ${checked} outfits narrowed to ${survivors}`}
      className="mt-3 rounded-lg border border-border bg-surface-2 p-3 sm:p-4"
    >
      <p className="text-2xs uppercase tracking-wider text-muted m-0">Your closet, today</p>
      <p className="font-display text-3xl leading-tight m-0 mt-0.5 text-foreground">
        {checked} outfits <span className="text-muted">→</span> {survivors} left
      </p>
      {context && <p className="text-xs text-muted m-0 mt-1 capitalize-first">{context}</p>}

      <ol className="list-none p-0 m-0 mt-3">
        {funnel.stages.map((stage, index) => {
          const after = stage.before - stage.cut;
          return (
            <li key={stage.check} className="border-t border-border/60 py-2">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium text-foreground">{stage.label}</span>
                <span className={stage.cut > 0 ? "text-status-fail font-medium shrink-0" : "text-muted shrink-0"}>
                  {stage.status === "no_data" ? "Not checked" : stage.cut > 0 ? `cut ${stage.cut}` : "cut 0"}
                </span>
              </div>
              <StageBar share={checked > 0 ? after / checked : 0} delay={index * 0.12} />
              {stage.status === "no_data" && stage.no_data_reason && (
                <p className="text-xs text-muted m-0 mt-1 leading-relaxed">{formatReason(stage.no_data_reason)}</p>
              )}
              {stage.reasons.slice(0, 2).map((reason) => (
                <p key={reason} className="text-xs text-muted m-0 mt-1 leading-relaxed">
                  {formatReason(reason)}
                </p>
              ))}
              {stage.kept_with_warning > 0 && stage.cut === 0 && (
                <p className="text-xs text-status-warn m-0 mt-1">
                  Nothing else passed, so {stage.kept_with_warning} stayed with a warning.
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {funnel.survivors.length > 0 ? (
        <div className="border-t border-border/60 pt-3">
          <p className="text-2xs uppercase tracking-wider text-muted m-0 mb-2">
            {survivors > funnel.survivors.length ? `Best ${funnel.survivors.length} of ${survivors}` : "What survived"}
          </p>
          <ol className="list-none p-0 m-0 space-y-2">
            {funnel.survivors.map((survivor) => (
              <li key={survivor.items.map((item) => item.id).join("|")} className="text-xs">
                <div className="flex gap-1.5 mb-1">
                  {survivor.items.map((item) =>
                    item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={item.id}
                        src={item.image_url}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        className="w-10 h-10 object-cover rounded bg-surface"
                      />
                    ) : null,
                  )}
                </div>
                <p className="m-0 text-foreground">{survivor.items.map((item) => item.name).join(" + ")}</p>
                {survivor.warnings[0] && (
                  <p className="m-0 mt-0.5 text-status-warn leading-relaxed">{formatReason(survivor.warnings[0])}</p>
                )}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="border-t border-border/60 pt-3 m-0 text-sm text-foreground">
          Nothing in your closet survives this one.
        </p>
      )}

      <p className="text-2xs text-muted m-0 mt-3 pt-2 border-t border-border/60">
        {total > checked ? `Checked a sample of ${checked} from ${total} combinations · ` : ""}
        {funnel.measured_skin ? "Skin tone measured by YouCam Skin AI" : "No measured skin tone yet"}
        {funnel.garment_colors_measured ? " · Garment colors measured" : " · Garment colors estimated from their names"}
      </p>
    </section>
  );
}
