import { useRef, useState } from "react";
import { MEMBER_SERVICES_DISPLAY } from "./Assistant.tsx";

/**
 * Replica of cloverhealth.com for the case-study host page. Layout, copy, colour
 * and imagery follow the real site; contact numbers are placeholders per D-026,
 * and the CMS marketing identifier is omitted because reproducing it would
 * assert CMS approval of this page.
 */

const BENEFITS = [
  { title: "Dental, Vision,\nOTC, & More", link: "Start Saving", icon: "card" },
  { title: "Prescription Drugs", link: "Get Started", icon: "pig" },
  { title: "Getting the Care\nYou Need", link: "Find a Doctor", icon: "pin" },
] as const;

const DIFFERENCE = [
  { title: "Affordability", body: "$0 to low monthly plan premiums and copays" },
  { title: "Flexibility", body: "Large network of hospitals and providers with no referrals required" },
  { title: "Predictability", body: "Focus on copays versus coinsurance (% of cost)" },
  { title: "Value", body: "Extras like allowances for dental, eyewear, and over-the-counter items" },
] as const;

const TESTIMONIALS = [
  {
    quote:
      "The ease of going to a doctor's office and showing my card and seeing a smile on their face. You know this is going to go easy.",
    name: "Al",
    since: "MEMBER SINCE 2014",
    avatar: "/img/avatar-016.jpg",
  },
  {
    quote: "I've been a Clover member for about 6 years...I would 100% recommend it.",
    name: "Natalia",
    since: "MEMBER SINCE 2018",
    avatar: "/img/avatar-017.jpg",
  },
  {
    quote: "With the over-the-counter things like my vitamins. I like getting rewards.",
    name: "Carol",
    since: "MEMBER SINCE 2024",
    avatar: "/img/avatar-018.jpg",
  },
] as const;

const NAV_LEFT = ["Plans & Coverage", "Medicare Resources", "For Members"] as const;
const NAV_RIGHT = ["For Providers", "For Agents", "About Us"] as const;

const FOOTER = [
  {
    heading: "For Members",
    links: [
      "Find a Plan",
      "Find a Provider",
      "Formulary",
      "Multi-Language Insert",
      "Notice of Privacy Practices",
      "Share Health Information",
    ],
  },
  { heading: "Locations", links: ["Georgia", "New Jersey", "Pennsylvania", "South Carolina", "Texas"] },
] as const;

const FOOTER_LOWER = [
  { heading: "For Agents", links: ["Plan Documents & Enrollment", "Helpful Resources", "Agent FAQ", "Agent Portal"] },
  { heading: "For Providers", links: ["Submit a Prior Authorization", "Forms and Documents", "Provider Manual"] },
  { heading: "For Developers", links: ["Developer Guidelines", "Developer Terms of Use"] },
] as const;

export function Landing({ onAsk }: { onAsk: () => void }): React.JSX.Element {
  const [noticeOpen, setNoticeOpen] = useState(true);
  const [promoOpen, setPromoOpen] = useState(true);
  const noticeChip = useRef<HTMLButtonElement>(null);
  const noticeClose = useRef<HTMLButtonElement>(null);

  return (
    <div className="cl">
      {/*
        FR-30 requires a persistent unaffiliated notice, so closing collapses it
        to a chip rather than removing it. The chip reopens the full text.
      */}
      {noticeOpen ? (
        <div className="cl-disclaimer" role="note">
          <p>
            Unaffiliated case study. Not operated by or endorsed by Clover Health. Contact details
            are placeholders.
          </p>
          <button
            ref={noticeClose}
            type="button"
            className="cl-dismiss"
            onClick={() => {
              setNoticeOpen(false);
              requestAnimationFrame(() => noticeChip.current?.focus());
            }}
          >
            <span className="visually-hidden">Collapse the case-study notice</span>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      ) : (
        <button
          ref={noticeChip}
          type="button"
          className="cl-notice-chip"
          onClick={() => {
            setNoticeOpen(true);
            requestAnimationFrame(() => noticeClose.current?.focus());
          }}
        >
          Unaffiliated case study. Read the full notice
        </button>
      )}

      {promoOpen && (
        <div className="cl-announce">
          <p>Last Chance: 2026 LiveHealthy Visit Reward. Call to schedule</p>
          <a className="cl-announce__phone" href={`tel:${MEMBER_SERVICES_DISPLAY}`}>
            {MEMBER_SERVICES_DISPLAY}
          </a>
          <button type="button" className="cl-dismiss cl-dismiss--dark" onClick={() => setPromoOpen(false)}>
            <span className="visually-hidden">Dismiss the LiveHealthy reward message</span>
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}

      <a className="skip-link" href="#main">Skip to main content</a>

      <header className="cl-head">
        <span className="cl-logo">Clover Health</span>
        <div className="cl-head__actions">
          <a className="cl-btn cl-btn--outline-light" href={`tel:${MEMBER_SERVICES_DISPLAY}`}>
            Call Us
          </a>
          <a className="cl-btn cl-btn--lilac" href="#members">My Clover</a>
          <a className="cl-btn cl-btn--ghost" href="#language">English</a>
        </div>
      </header>

      <nav className="cl-nav" aria-label="Primary">
        <ul className="cl-nav__list">
          {NAV_LEFT.map((item) => (
            <li key={item}><a href={`#${item.replace(/\W+/g, "-").toLowerCase()}`}>{item}</a></li>
          ))}
        </ul>
        <ul className="cl-nav__list cl-nav__list--end">
          {NAV_RIGHT.map((item) => (
            <li key={item}><a href={`#${item.replace(/\W+/g, "-").toLowerCase()}`}>{item}</a></li>
          ))}
        </ul>
      </nav>

      <main id="main">
        <section className="cl-hero">
          <img className="cl-hero__img" src="/img/hero-member.jpg" alt="" />
          <div className="cl-hero__card">
            <h1>Get the Medicare Coverage You've Been Missing</h1>
            <p>
              Find plans with $0 to low premiums and copays, plus extras like dental, vision, OTC,
              and a rewards program.
            </p>
            <form className="cl-zip" onSubmit={(event) => event.preventDefault()}>
              <label className="visually-hidden" htmlFor="zip">Enter your ZIP code</label>
              <input id="zip" placeholder="Enter your ZIP code" inputMode="numeric" />
              <button type="submit" className="cl-btn cl-btn--purple">View Plans</button>
            </form>
          </div>
        </section>

        <section className="cl-section" id="plans-coverage">
          <h2 className="cl-h2">Get the Benefits You Deserve</h2>
          <ul className="cl-benefits">
            {BENEFITS.map((benefit) => (
              <li key={benefit.link}>
                <span className="cl-ico" aria-hidden="true"><Icon name={benefit.icon} /></span>
                <h3>{benefit.title}</h3>
                <a className="cl-inline-link" href="#plans-coverage">{benefit.link}</a>
              </li>
            ))}
          </ul>
        </section>

        <section className="cl-guide" aria-labelledby="guide-title">
          <img className="cl-guide__img" src="/img/guide-couple.jpg" alt="" />
          <form className="cl-guide__card" onSubmit={(event) => event.preventDefault()}>
            <h2 id="guide-title">
              Your <span className="cl-accent">Free</span> Medicare Guide Is Here
            </h2>
            <div className="cl-guide__row">
              <span>
                <label className="visually-hidden" htmlFor="first">First Name</label>
                <input id="first" placeholder="First Name*" />
              </span>
              <span>
                <label className="visually-hidden" htmlFor="gzip">ZIP code</label>
                <input id="gzip" placeholder="ZIP code*" inputMode="numeric" />
              </span>
            </div>
            <label className="visually-hidden" htmlFor="email">Email</label>
            <input id="email" type="email" placeholder="Email*" />
            <button type="submit" className="cl-btn cl-btn--purple cl-btn--block">Submit</button>
            <p className="cl-fine">
              By providing your contact information, you agree to allow us to contact you through
              email, autodialed calls, or text messages at the phone number or email address
              provided, which may include materials describing products and services. You are not
              required to agree to purchase Clover Health products or services and can opt out at
              any time. Message and data rates may apply.
            </p>
          </form>
        </section>

        <section className="cl-section" id="medicare-resources">
          <h2 className="cl-h2">Medicare Done Differently</h2>
          <p className="cl-lede">
            From the beginning, our mission was simple—to improve the life of every person. We make
            sure that our Medicare Advantage plans provide:
          </p>
          <ul className="cl-diff">
            {DIFFERENCE.map((item) => (
              <li key={item.title}>
                <span className="cl-ico cl-ico--star" aria-hidden="true"><Icon name="star" /></span>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="cl-cta-card">
            <div>
              <p className="cl-cta-card__title">
                It's what we call the <strong>Clover Difference!</strong>
              </p>
              <p>See the benefits of each plan.</p>
            </div>
            <button type="button" className="cl-btn cl-btn--purple" onClick={onAsk}>
              View Plans
            </button>
          </div>
        </section>

        <section className="cl-rewards" aria-labelledby="rewards-title">
          <img className="cl-rewards__img" src="/img/livehealthy-kitchen.jpg" alt="" />
          <div className="cl-rewards__card">
            <h2 id="rewards-title">Clover LiveHealthy Rewards Program</h2>
            <p>Earn up to $400 Reward Dollars through health related activities</p>
            <a className="cl-btn cl-btn--purple" href="#rewards">View Program Details</a>
          </div>
        </section>

        <section className="cl-section" id="for-members">
          <h2 className="cl-h2">What Our Members Are Saying</h2>
          <ul className="cl-quotes">
            {TESTIMONIALS.map((item) => (
              <li key={item.name}>
                <blockquote>&ldquo;{item.quote}&rdquo;</blockquote>
                <div className="cl-quotes__who">
                  <img src={item.avatar} alt="" />
                  <div>
                    <p className="cl-quotes__name">{item.name}</p>
                    <p className="cl-quotes__since">{item.since}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="cl-final" id="support">
          <h2 className="cl-h2">Find out if Clover is right for you.</h2>
          <p>We're available to talk during member services hours.*</p>
          <div className="cl-final__actions">
            <a className="cl-btn cl-btn--outline-dark" href={`tel:${MEMBER_SERVICES_DISPLAY}`}>
              {MEMBER_SERVICES_DISPLAY} (TTY 711)
            </a>
            <button type="button" className="cl-btn cl-btn--purple" onClick={onAsk}>
              Request a Call
            </button>
          </div>
        </section>
      </main>

      <footer className="cl-foot">
        <div className="cl-foot__cols">
          {FOOTER.map((column) => (
            <div key={column.heading}>
              <p className="cl-foot__h">{column.heading}</p>
              <ul>{column.links.map((link) => <li key={link}><a href="#members">{link}</a></li>)}</ul>
            </div>
          ))}
          <div>
            <p className="cl-foot__h">Member Services</p>
            <p className="cl-foot__brand">Clover Health</p>
            <p className="cl-foot__phone">{MEMBER_SERVICES_DISPLAY} (TTY 711)</p>
            <p className="cl-foot__hours">Member services hours are a placeholder in this case study</p>
            <p className="cl-foot__addr">Clover Health<br />P.O. Box 21164<br />Eagan, MN 55121</p>
          </div>
        </div>

        <div className="cl-foot__cols cl-foot__cols--lower">
          {FOOTER_LOWER.map((column) => (
            <div key={column.heading}>
              <p className="cl-foot__h">{column.heading}</p>
              <ul>{column.links.map((link) => <li key={link}><a href="#members">{link}</a></li>)}</ul>
            </div>
          ))}
        </div>

        <div className="cl-legal">
          <p>
            *Member services hours are shown as a placeholder here. This is a case study and not a
            source of Clover Health plan information.
          </p>
          <p className="cl-legal__updated">LAST UPDATED: 2026-03-06</p>
          <p>
            Enrollment in a plan may be limited to certain times of the year unless you qualify for
            a special (election/enrollment) period or you are in your Medicare Initial Election
            Period.
          </p>
          <p>
            Clover Health is a Preferred Provider Organization (PPO) and a Health Maintenance
            Organization (HMO) with a Medicare contract. Enrollment in Clover Health depends on
            contract renewal. You must continue to pay your Medicare Part B premium. For plans that
            provide drug coverage, the formulary may change during the year. Out-of-network/non-contracted
            providers are under no obligation to treat Clover members, except in emergency
            situations. For a decision about whether we will cover an out-of-network service, we
            encourage you or your provider to ask us for a pre-service organization determination
            before you receive the service. Please call our customer service number or see your
            Evidence of Coverage for more information, including the cost-sharing that applies to
            out-of-network services.
          </p>
          <p>
            Medicare beneficiaries may also enroll in Clover Health through the CMS Medicare Online
            Enrollment Center located at <a href="https://www.medicare.gov">http://www.medicare.gov</a>.
          </p>
          <p>
            This information is not a complete description of benefits. Limitations, copayments, and
            restrictions may apply. Plan performance Medicare Star Ratings are assessed each year and
            may change from one year to the next. Benefits, premiums, and/or copayments/coinsurance
            may change on January 1 of each year. The formulary, pharmacy network, and/or provider
            network may change at any time. You will receive notice when necessary.
          </p>
        </div>

        <div className="cl-copyright">
          <p>© 2026</p>
          <p>
            Clover Health. All Rights Reserved.{" "}
            <a href="#editorial">Editorial Policy</a> <a href="#a11y">Digital Accessibility Policy</a>{" "}
            <a href="#dev">For Developers</a> <a href="#privacy">Privacy Policy</a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function Icon({ name }: { name: "card" | "pig" | "pin" | "star" }): React.JSX.Element {
  const paths: Record<typeof name, string> = {
    card: "M3 6h18v12H3zM6 10h5v5H6zm8 0h4m-4 3h4",
    pig: "M4 12a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3a2 2 0 0 1-2 2h-1v2h-3v-2H9v2H6v-2H5a1 1 0 0 1-1-1zm11-1h.01",
    pin: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
    star: "m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 9.7l5.4-.8z",
  };
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
