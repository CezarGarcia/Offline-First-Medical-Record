"use client";

import { useTemplateCopy } from "@/components/foundations/template-copy/template-copy";

import { RiAddLine, RiAsterisk, RiDropLine, RiMenLine, RiStethoscopeLine } from "@remixicon/react";
import type { ComponentType, ReactNode } from "react";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

/**
 * Figma source: Board UI → medical profile dashboard → Frame 125 (node
 * 3950:5657). Patient photo, name, and a stack of label/value rows.
 *
 * Vertical rhythm from Figma's absolute positions: avatar top 24, name top
 * 105 (avatar bottom 90 → 15px gap), details top 146 (name bottom 131 →
 * 15px gap again) — hence the odd-looking `gap-[15px]`, replicated rather
 * than rounded to a spacing step.
 */

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

export type PatientDetail = { icon: IconComponent; label: string; value: ReactNode; tone?: "default" | "alert" };

const DETAILS: PatientDetail[] = [
  { icon: RiAsterisk, label: "Date of Birth", value: "28 July, 1997" },
  { icon: RiMenLine, label: "Gender", value: "Male" },
  { icon: RiDropLine, label: "Blood Type", value: "A rh+" },
  { icon: RiStethoscopeLine, label: "GP Doctor", value: "Mattheus Clarkson" },
];

export interface PatientInfoCardProps {
  className?: string;
  /** Patient name under the avatar. */
  name?: string;
  /** Avatar initials (defaults to the first letter of the name). */
  initials?: string;
  /** Label/value rows under the name. */
  details?: PatientDetail[];
  /** Small line under the name (record id, age). */
  subtitle?: ReactNode;
  /** Replaces the demo "add photo" button on the avatar; pass null for none. */
  avatarAction?: ReactNode;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 2 || /^[A-Z]/.test(part));
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function PatientInfoCard({
  className,
  name = "Mertcan Esmergül",
  initials,
  details = DETAILS,
  subtitle,
  avatarAction,
}: PatientInfoCardProps = {}) {
  const localize = useTemplateCopy();
  return localize((
    <section
      className={cx(
        "flex w-full min-w-0 flex-col items-center gap-[15px] rounded-[20px] bg-background-secondary-default px-2.5 pt-6 pb-2.5",
        className,
      )}
    >
      <div className="relative">
        <Avatar size="lg" initials={initials ?? initialsOf(name)} className="size-[66px] text-[24.75px]" />
        {avatarAction === undefined ? (
          <Button
            variant="secondary"
            size="xs"
            iconOnly
            leadingIcon={RiAddLine}
            aria-label="Add profile photo"
            className="absolute -top-0.5 -end-0.5 rounded-full"
          />
        ) : (
          avatarAction
        )}
      </div>
      <div className="flex max-w-full flex-col items-center gap-0.5 px-2 text-center">
        <p className="text-title-2-medium text-balance text-text-primary">{name}</p>
        {subtitle ? <p className="text-body-regular text-text-secondary">{subtitle}</p> : null}
      </div>
      <dl className="flex w-full flex-1 flex-col gap-2.5">
        {details.map((detail) => (
          <div
            key={detail.label}
            className={cx(
              "flex w-full items-center justify-between gap-3 rounded-2lg px-2.5 py-2",
              detail.tone === "alert" ? "bg-status-rose-background" : "bg-background-inner-default",
            )}
          >
            <dt className="flex shrink-0 items-center gap-1.5">
              <detail.icon
                className={cx("size-4 shrink-0", detail.tone === "alert" ? "text-status-rose-text" : "text-text-secondary")}
                aria-hidden
              />
              <span
                className={cx(
                  "text-body-regular whitespace-nowrap",
                  detail.tone === "alert" ? "text-status-rose-text" : "text-text-secondary",
                )}
              >
                {detail.label}
              </span>
            </dt>
            <dd
              className={cx(
                "min-w-0 text-end text-body-medium [overflow-wrap:anywhere]",
                detail.tone === "alert" ? "text-status-rose-text" : "text-text-primary",
              )}
            >
              {detail.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  ));
}
