import {
  VOLUNTEER_QUESTIONS,
  SECURITY_QUESTIONS,
  OTHER_TEAMS,
  submitTeamApplication,
  type QuestionDef
} from './team_applications';
import type { TeamAppRole } from './types/database';
import { initAllCustomSelects } from './custom_select';
import { supabase } from './lib/supabase';

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

const ALLOWED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'webp'];
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FILE_COUNT = 5;

let activeTeamTab: TeamAppRole = 'volunteer';
let selectedProofFiles: File[] = [];
let formSubmittedSuccess: { name: string; team: string; email: string } | null = null;

function ensureExtraExpStyles(): void {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('extra-exp-keyframes-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'extra-exp-keyframes-styles';
    styleEl.textContent = `
      @keyframes expCardSlideDown {
        0% {
          opacity: 0;
          transform: translateY(-12px);
        }
        100% {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(styleEl);
  }
}

function createExtraExperienceCard(expNumber: number): HTMLElement {
  ensureExtraExpStyles();
  const card = document.createElement('div');
  card.className = 'extra-exp-card';
  card.style.cssText = `
    background: rgba(11, 15, 42, 0.75);
    border: 1px solid rgba(217, 180, 90, 0.35);
    border-radius: 12px;
    padding: 1.25rem;
    position: relative;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    animation: expCardSlideDown 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  `;

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 0.65rem;">
      <h4 class="exp-card-heading" style="font-family: var(--font-display); font-size: 0.95rem; font-weight: 800; text-transform: uppercase; color: var(--gold); margin: 0; letter-spacing: 0.05em;">
        Experience ${expNumber}
      </h4>
      <button
        type="button"
        class="exp-remove-btn btn-interactive"
        aria-label="Remove Experience ${expNumber}"
        title="Remove Experience ${expNumber}"
        style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px; color: rgba(242, 244, 255, 0.75); padding: 0.25rem 0.6rem; font-size: 0.75rem; cursor: pointer; display: inline-flex; align-items: center; gap: 0.3rem;"
      >
        <span>✕</span>
        <span>Remove</span>
      </button>
    </div>

    <!-- Error message for this card -->
    <div class="exp-card-error" style="display: none; color: #f87171; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; padding: 0.45rem 0.75rem; font-size: 0.8rem; margin-bottom: 0.85rem;"></div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
      <div class="form-group" style="grid-column: 1 / -1;">
        <label class="form-label">Event or organisation *</label>
        <input
          type="text"
          class="form-input exp-event-input"
          maxlength="120"
          placeholder="e.g. Cairo International MUN 2026"
          required
        />
      </div>

      <div class="form-group">
        <label class="form-label">Your role</label>
        <input
          type="text"
          class="form-input exp-role-input"
          maxlength="120"
          placeholder="e.g. Logistics Officer / Chair / Delegate"
        />
      </div>

      <div class="form-group">
        <label class="form-label">When</label>
        <input
          type="text"
          class="form-input exp-when-input"
          maxlength="40"
          placeholder="e.g. March 2026"
        />
      </div>
    </div>

    <div class="form-group">
      <label class="form-label">What you did</label>
      <textarea
        class="form-textarea exp-desc-input"
        rows="3"
        maxlength="600"
        placeholder="Describe your responsibilities, key contributions, or achievements..."
      ></textarea>
      <div class="exp-char-counter" style="text-align: right; font-size: 0.72rem; color: rgba(242, 244, 255, 0.45); margin-top: 0.25rem;">
        0 / 600
      </div>
    </div>
  `;

  // Real-time character counter listener
  const descTextarea = card.querySelector('.exp-desc-input') as HTMLTextAreaElement | null;
  const counterEl = card.querySelector('.exp-char-counter') as HTMLElement | null;
  descTextarea?.addEventListener('input', () => {
    if (counterEl && descTextarea) {
      counterEl.textContent = `${descTextarea.value.length} / 600`;
      if (descTextarea.value.length >= 600) {
        counterEl.style.color = 'var(--gold)';
      } else {
        counterEl.style.color = 'rgba(242, 244, 255, 0.45)';
      }
    }
  });

  return card;
}

/**
 * Render the Public Team Application View (#view-team-apply)
 */
export function renderTeamApplyPage(container: HTMLElement | null): void {
  if (!container) return;

  if (formSubmittedSuccess) {
    container.innerHTML = `
      <div style="max-width: 720px; margin: 0 auto; padding: 2rem 1rem 5rem;">
        <a href="#/apply" class="back-home-link btn-interactive" style="margin-bottom: 2rem; display: inline-block;">← Back to Applications</a>

        <div class="team-form-card" style="border: 1.5px solid var(--gold); border-radius: 20px; padding: clamp(2rem, 5vw, 3.5rem); text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.75);">
          <div style="width: 72px; height: 72px; border-radius: 50%; background: rgba(217, 180, 90, 0.15); border: 2px solid var(--gold); color: var(--gold); display: inline-flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 1.5rem; animation: pulseDot 2s infinite ease-in-out;">
            ✦
          </div>

          <span class="eyebrow" style="color: var(--gold);">Application Submitted</span>
          <h2 style="font-family: var(--font-display); font-size: clamp(1.8rem, 4.5vw, 2.5rem); font-weight: 800; text-transform: uppercase; color: #ffffff; margin-bottom: 0.75rem; letter-spacing: -0.01em; word-break: normal; overflow-wrap: normal;">
            WELCOME, <em>${escapeHtml(formSubmittedSuccess.name)}!</em>
          </h2>

          <p style="font-size: 1.1rem; color: #f2f4ff; line-height: 1.6; max-width: 540px; margin: 0 auto 1.5rem;">
            Your application for the <strong style="color: var(--gold); text-transform: capitalize;">${escapeHtml(formSubmittedSuccess.team)} Team</strong> has been successfully received by the Monument MUN Secretariat.
          </p>

          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(217, 180, 90, 0.3); border-radius: 12px; padding: 1.25rem; max-width: 480px; margin: 0 auto 2rem; text-align: left; font-size: 0.9rem; color: rgba(242, 244, 255, 0.85); line-height: 1.6;">
            <div style="font-weight: 700; color: var(--gold); margin-bottom: 0.35rem; font-family: var(--font-display); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.08em;">Next Steps</div>
            Our leadership and department directors are reviewing candidate submissions. When your application is accepted, an official notice will be dispatched to <strong style="color: #ffffff; font-family: monospace;">${escapeHtml(formSubmittedSuccess.email)}</strong>.
          </div>

          <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
            <button type="button" id="team-apply-another-btn" class="apply-pill-btn btn-interactive" style="cursor: pointer;">
              Submit Another Application
            </button>
            <a href="#/" class="btn-interactive" style="background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #ffffff; padding: 0.75rem 1.6rem; border-radius: 9999px; font-family: var(--font-display); font-size: 0.82rem; font-weight: 800; text-transform: uppercase; text-decoration: none; display: inline-flex; align-items: center;">
              Return to Home Stage
            </a>
          </div>
        </div>
      </div>
    `;

    // Reset selected proof files on 'Submit Another Application'
  document.getElementById('team-apply-another-btn')?.addEventListener('click', () => {
    formSubmittedSuccess = null;
    selectedProofFiles = [];
    renderTeamApplyPage(container);
  });
  return;
}

  const questions: QuestionDef[] = activeTeamTab === 'volunteer' ? VOLUNTEER_QUESTIONS : SECURITY_QUESTIONS;
  const isVolunteer = activeTeamTab === 'volunteer';

  container.innerHTML = `
    <div style="max-width: 1040px; margin: 0 auto; padding: 1.5rem 1rem 6rem; position: relative; z-index: 25;">
      <!-- Dark Gradient Intro Banner -->
      <div class="team-apply-intro-banner">
        <a href="#/apply" class="back-home-link btn-interactive">← Back to Applications</a>
        <span class="eyebrow">Monument MUN 2027 · Organizing Team Recruitment</span>
        <h1 class="section-heading">APPLY TO <em>JOIN THE TEAM.</em></h1>
        <p class="team-apply-lead">
          Become an integral architect of the conference. Applications are currently open for <strong>Volunteer</strong> and <strong>Security</strong> positions only. Choose your desired role below to begin your application.
        </p>
      </div>

      <!-- OPEN TEAMS SELECTOR CARDS -->
      <div class="team-roles-grid">
        <!-- Card 1: Volunteer (Open) -->
        <div id="select-team-volunteer" class="team-role-card ${isVolunteer ? 'selected' : ''}" role="button" tabindex="0" aria-pressed="${isVolunteer ? 'true' : 'false'}">
          <div class="team-status-badge">
            <span class="team-status-badge-dot"></span>
            <span>Applications open</span>
          </div>
          <h3 class="team-role-title">VOLUNTEER <em>TEAM.</em></h3>
          <p class="team-role-desc">
            Support delegate reception, assembly registration, ceremonial logistics, AV media, and committee rooms.
          </p>
          <button type="button" class="team-role-select-btn" tabindex="-1">
            <span>${isVolunteer ? '✓ Role Selected' : 'Select Role'}</span>
          </button>
        </div>

        <!-- Card 2: Security (Open) -->
        <div id="select-team-security" class="team-role-card ${!isVolunteer ? 'selected' : ''}" role="button" tabindex="0" aria-pressed="${!isVolunteer ? 'true' : 'false'}">
          <div class="team-status-badge">
            <span class="team-status-badge-dot"></span>
            <span>Applications open</span>
          </div>
          <h3 class="team-role-title">SECURITY <em>CORPS.</em></h3>
          <p class="team-role-desc">
            Safeguard debate chambers, verify staff & delegate credentials, coordinate access control, and manage crowd flow.
          </p>
          <button type="button" class="team-role-select-btn" tabindex="-1">
            <span>${!isVolunteer ? '✓ Role Selected' : 'Select Role'}</span>
          </button>
        </div>
      </div>

      <!-- THE APPLICATION FORM -->
      <div class="team-form-card">
        <div style="border-bottom: 1px solid rgba(217, 180, 90, 0.2); padding-bottom: 1.25rem; margin-bottom: 2rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
          <div>
            <span class="eyebrow" style="color: var(--gold); margin-bottom: 0.25rem;">Candidate Dossier</span>
            <h2 style="font-family: var(--font-display); font-size: 1.6rem; font-weight: 800; text-transform: uppercase; color: #ffffff; margin: 0;">
              ${isVolunteer ? 'VOLUNTEER APPLICATION' : 'SECURITY APPLICATION'}
            </h2>
          </div>
          <span style="font-family: var(--font-display); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; background: rgba(217, 180, 90, 0.15); border: 1px solid var(--gold); color: var(--gold); padding: 0.35rem 0.85rem; border-radius: 9999px;">
            Target: ${isVolunteer ? 'Volunteer' : 'Security'}
          </span>
        </div>

        <!-- Feedback Alert Banner -->
        <div id="team-form-feedback" class="status-banner" style="display: none; margin-bottom: 1.5rem;"></div>

        <form id="team-application-form">
          <!-- Contact Details Grid -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem; margin-bottom: 1.75rem;">
            <div class="form-group">
              <label class="form-label" for="ta-fullname">Full Name *</label>
              <input type="text" id="ta-fullname" class="form-input" placeholder="e.g. Layla Mahmoud" required />
            </div>

            <div class="form-group">
              <label class="form-label" for="ta-email">Email Address *</label>
              <input type="email" id="ta-email" class="form-input" placeholder="e.g. layla.mahmoud@gmail.com" required />
              <div style="font-size: 0.75rem; color: rgba(242, 244, 255, 0.5); margin-top: 0.35rem;">
                Official acceptance notices will be sent to this email. One application per email.
              </div>
            </div>

            <div class="form-group" style="grid-column: 1 / -1;">
              <label class="form-label" for="ta-phone">Phone Number (WhatsApp Active) *</label>
              <input type="tel" id="ta-phone" class="form-input" placeholder="e.g. +20 100 123 4567" required />
            </div>
          </div>

          <!-- Role Questions -->
          <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 1.5rem; margin-bottom: 2rem;">
            <h3 style="font-family: var(--font-display); font-size: 1.15rem; font-weight: 800; text-transform: uppercase; color: var(--gold); margin-bottom: 1.25rem;">
              Role Specific Questions
            </h3>

            <div style="display: flex; flex-direction: column; gap: 1.5rem;">
              ${questions.map((q) => {
                const sublabel = q.sublabel ? `<div style="font-size: 0.8rem; color: rgba(242, 244, 255, 0.6); margin-bottom: 0.45rem;">${escapeHtml(q.sublabel)}</div>` : '';

                let fieldHtml = '';
                if (q.type === 'select') {
                  fieldHtml = `
                    <div class="form-group">
                      <label class="form-label" for="ta-${q.id}">${escapeHtml(q.label)} ${q.required ? '*' : ''}</label>
                      ${sublabel}
                      <select id="ta-${q.id}" class="form-select" required>
                        <option value="">-- Please select an option --</option>
                        ${(q.options || []).map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
                      </select>
                    </div>
                  `;
                } else if (q.type === 'textarea') {
                  fieldHtml = `
                    <div class="form-group">
                      <label class="form-label" for="ta-${q.id}">${escapeHtml(q.label)} ${q.required ? '*' : ''}</label>
                      ${sublabel}
                      <textarea id="ta-${q.id}" class="form-textarea" rows="3" placeholder="${escapeHtml(q.placeholder || '')}" required></textarea>
                    </div>
                  `;
                } else {
                  fieldHtml = `
                    <div class="form-group">
                      <label class="form-label" for="ta-${q.id}">${escapeHtml(q.label)} ${q.required ? '*' : ''}</label>
                      ${sublabel}
                      <input type="text" id="ta-${q.id}" class="form-input" placeholder="${escapeHtml(q.placeholder || '')}" required />
                    </div>
                  `;
                }

                // Directly under "Past Experience in MUN or Large Events", render "+ Add another experience" button, container, and Proof of Experience upload area for volunteers
                if (isVolunteer && q.id === 'q_experience') {
                  fieldHtml += `
                    <!-- Additional Experiences Section (Volunteer only) -->
                    <div style="margin-top: 0.85rem; margin-bottom: 1.5rem;">
                      <!-- Add Experience Button & Limit Notice -->
                      <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 0.85rem; margin-bottom: 0.85rem;">
                        <button
                          type="button"
                          id="ta-add-experience-btn"
                          class="btn-interactive"
                          style="display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(217, 180, 90, 0.08); border: 1px solid var(--border-gold); color: var(--gold); border-radius: 9999px; padding: 0.5rem 1.15rem; font-family: var(--font-display); font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease;"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                          </svg>
                          <span>+ Add another experience</span>
                        </button>
                        <span
                          id="ta-add-exp-limit-msg"
                          style="display: none; font-size: 0.8rem; color: rgba(242, 244, 255, 0.6); font-style: italic;"
                        >
                          Maximum of 5 extra experiences
                        </span>
                      </div>

                      <!-- Container where new experience cards slide down into -->
                      <div id="ta-additional-experiences-container" style="display: flex; flex-direction: column; gap: 1rem;"></div>
                    </div>

                    <!-- Proof of Experience Upload Area (Volunteer only) -->
                    <div class="form-group" style="margin-top: 0.25rem;">
                      <label class="form-label" for="ta-proof-dropzone" style="display: flex; justify-content: space-between; align-items: baseline;">
                        <span>Proof of your experience (optional)</span>
                        <span style="font-size: 0.72rem; color: var(--gold); text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em;">Max 5 files · 5 MB each</span>
                      </label>
                      <div style="font-size: 0.8rem; color: rgba(242, 244, 255, 0.6); margin-bottom: 0.65rem;">
                        Upload certificates, letters or screenshots. PDF, PNG, JPG or WebP, up to 5 MB each, maximum 5 files.
                      </div>

                      <!-- Hidden file input -->
                      <input
                        type="file"
                        id="ta-proof-input"
                        multiple
                        accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
                        style="display: none;"
                      />

                      <!-- Drag-and-drop zone -->
                      <div
                        id="ta-proof-dropzone"
                        role="button"
                        tabindex="0"
                        aria-label="Upload proof of experience files. Drag files here or click to browse."
                        class="proof-dropzone"
                        style="background: rgba(11, 15, 42, 0.65); border: 1.5px dashed rgba(217, 180, 90, 0.45); border-radius: 12px; padding: 1.75rem 1.25rem; text-align: center; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.65rem;"
                      >
                        <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(217, 180, 90, 0.12); border: 1px solid var(--border-gold); display: flex; align-items: center; justify-content: center; color: var(--gold);">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                          </svg>
                        </div>
                        <div style="font-family: var(--font-display); font-size: 0.95rem; font-weight: 700; color: #ffffff;">
                          Drag files here or <span style="color: var(--gold); text-decoration: underline;">click to browse</span>
                        </div>
                        <div style="font-size: 0.78rem; color: rgba(242, 244, 255, 0.55);">
                          PDF, PNG, JPG, JPEG, and WebP (up to 5 MB each)
                        </div>
                      </div>

                      <!-- Error banner -->
                      <div id="ta-proof-error" style="display: none; color: #f87171; background: rgba(239, 68, 68, 0.14); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 8px; padding: 0.65rem 0.95rem; font-size: 0.84rem; margin-top: 0.75rem;"></div>

                      <!-- List of selected files -->
                      <div id="ta-proof-file-list" style="margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem;"></div>

                      <!-- Upload progress bar container -->
                      <div id="ta-proof-progress-container" style="display: none; margin-top: 0.75rem; background: rgba(11, 15, 42, 0.9); border: 1px solid rgba(217, 180, 90, 0.35); border-radius: 8px; padding: 0.85rem 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.45rem; font-size: 0.82rem; color: rgba(242, 244, 255, 0.9);">
                          <span id="ta-proof-progress-label">Preparing files...</span>
                          <span id="ta-proof-progress-percent" style="color: var(--gold); font-weight: 700;">0%</span>
                        </div>
                        <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.08); border-radius: 9999px; overflow: hidden;">
                          <div id="ta-proof-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #d9b45a, #f3d88a); border-radius: 9999px; transition: width 0.2s ease;"></div>
                        </div>
                      </div>
                    </div>
                  `;
                }

                return fieldHtml;
              }).join('')}
            </div>
          </div>

          ${!isVolunteer ? `
            <!-- Code of Conduct Checkbox (Security only) -->
            <div style="margin-bottom: 2rem; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1.25rem;">
              <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer; font-size: 0.88rem; color: rgba(242, 244, 255, 0.85); line-height: 1.5;">
                <input type="checkbox" id="ta-agreement" required style="margin-top: 0.25rem; accent-color: var(--gold);" />
                <span>
                  I confirm that all responses provided above are accurate and truthful. If accepted, I commit to attending scheduled preparation sessions and upholding the integrity and decorum of Monument MUN 2027.
                </span>
              </label>
            </div>
          ` : ''}

          <!-- Submit Button -->
          <button type="submit" id="ta-submit-btn" class="form-submit-btn btn-interactive" style="width: 100%; padding: 1rem; font-size: 0.95rem; font-weight: 800; letter-spacing: 0.08em;">
            Submit ${isVolunteer ? 'Volunteer' : 'Security'} Application
          </button>
        </form>
      </div>

      <!-- OTHER TEAMS (CLOSED FOR NOW) -->
      <div>
        <div style="text-align: center; margin-bottom: 1.5rem;">
          <span class="eyebrow" style="color: rgba(242, 244, 255, 0.5);">Organizing Structure</span>
          <h2 style="font-family: var(--font-display); font-size: 1.45rem; font-weight: 800; text-transform: uppercase; color: #ffffff;">
            OTHER TEAMS <em>(CLOSED FOR NOW).</em>
          </h2>
          <p style="font-size: 0.92rem; color: rgba(242, 244, 255, 0.6); max-width: 600px; margin: 0.35rem auto 0;">
            The departments below are currently closed. Direct recruitment or appointments for these areas will be announced at a later date.
          </p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem;">
          ${OTHER_TEAMS.map((ot) => `
            <div class="team-closed-card">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; gap: 0.5rem;">
                <h4 style="font-family: var(--font-display); font-size: 1rem; font-weight: 700; color: #ffffff; margin: 0; word-break: normal; overflow-wrap: normal;">
                  ${escapeHtml(ot.name)}
                </h4>
                <span style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); color: rgba(242, 244, 255, 0.5); padding: 0.15rem 0.5rem; border-radius: 9999px; white-space: nowrap; flex-shrink: 0;">
                  ${escapeHtml(ot.status)}
                </span>
              </div>
              <p style="font-size: 0.82rem; color: rgba(242, 244, 255, 0.6); margin: 0; line-height: 1.4; word-break: normal; overflow-wrap: normal;">
                ${escapeHtml(ot.description)}
              </p>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Initialize custom accessible dark & gold dropdowns for all selects
  initAllCustomSelects(container);

  // Attach card toggle listeners (both click and keyboard accessibility)
  const volCard = document.getElementById('select-team-volunteer');
  const secCard = document.getElementById('select-team-security');

  const selectVolunteer = () => {
    if (activeTeamTab !== 'volunteer') {
      activeTeamTab = 'volunteer';
      selectedProofFiles = [];
      renderTeamApplyPage(container);
    }
  };

  const selectSecurity = () => {
    if (activeTeamTab !== 'security') {
      activeTeamTab = 'security';
      selectedProofFiles = [];
      renderTeamApplyPage(container);
    }
  };

  volCard?.addEventListener('click', selectVolunteer);
  volCard?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectVolunteer();
    }
  });

  secCard?.addEventListener('click', selectSecurity);
  secCard?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      selectSecurity();
    }
  });

  // Volunteer Features: Additional Experiences & Proof Upload
  if (isVolunteer) {
    // 1. Additional Experiences ("+ Add another experience")
    const addExpBtn = document.getElementById('ta-add-experience-btn') as HTMLButtonElement | null;
    const expContainer = document.getElementById('ta-additional-experiences-container');
    const limitNotice = document.getElementById('ta-add-exp-limit-msg');

    const updateExpBtnState = () => {
      if (!expContainer || !addExpBtn) return;
      const count = expContainer.querySelectorAll('.extra-exp-card').length;
      if (count >= 5) {
        addExpBtn.disabled = true;
        addExpBtn.setAttribute('aria-disabled', 'true');
        addExpBtn.style.opacity = '0.45';
        addExpBtn.style.cursor = 'not-allowed';
        if (limitNotice) limitNotice.style.display = 'inline-block';
      } else {
        addExpBtn.disabled = false;
        addExpBtn.removeAttribute('aria-disabled');
        addExpBtn.style.opacity = '1';
        addExpBtn.style.cursor = 'pointer';
        if (limitNotice) limitNotice.style.display = 'none';
      }
    };

    const renumberExpCards = () => {
      if (!expContainer) return;
      const cards = expContainer.querySelectorAll('.extra-exp-card');
      cards.forEach((card, idx) => {
        const num = idx + 2;
        const heading = card.querySelector('.exp-card-heading');
        if (heading) heading.textContent = `Experience ${num}`;
        const removeBtn = card.querySelector('.exp-remove-btn');
        if (removeBtn) {
          removeBtn.setAttribute('aria-label', `Remove Experience ${num}`);
          removeBtn.setAttribute('title', `Remove Experience ${num}`);
        }
      });
    };

    const attachCardListeners = (card: HTMLElement) => {
      const removeBtn = card.querySelector('.exp-remove-btn');
      removeBtn?.addEventListener('click', () => {
        card.style.transition = 'opacity 0.22s ease-out, transform 0.22s ease-out';
        card.style.opacity = '0';
        card.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          card.remove();
          renumberExpCards();
          updateExpBtnState();
        }, 220);
      });
    };

    addExpBtn?.addEventListener('click', () => {
      if (!expContainer) return;
      const currentCount = expContainer.querySelectorAll('.extra-exp-card').length;
      if (currentCount >= 5) return;

      const card = createExtraExperienceCard(currentCount + 2);
      expContainer.appendChild(card);
      attachCardListeners(card);
      renumberExpCards();
      updateExpBtnState();

      // Focus moves to the first field of the new card
      const firstInput = card.querySelector('.exp-event-input') as HTMLInputElement | null;
      firstInput?.focus();
    });

    // 2. Proof of Experience Upload Area Handling
    const dropzone = document.getElementById('ta-proof-dropzone');
    const fileInput = document.getElementById('ta-proof-input') as HTMLInputElement | null;
    const fileListEl = document.getElementById('ta-proof-file-list');
    const proofErrorEl = document.getElementById('ta-proof-error');

    const showProofError = (msg: string) => {
      if (!proofErrorEl) return;
      proofErrorEl.textContent = msg;
      proofErrorEl.style.display = 'block';
    };

    const clearProofError = () => {
      if (!proofErrorEl) return;
      proofErrorEl.textContent = '';
      proofErrorEl.style.display = 'none';
    };

    const renderSelectedFilesList = () => {
      if (!fileListEl) return;
      if (selectedProofFiles.length === 0) {
        fileListEl.innerHTML = '';
        return;
      }

      fileListEl.innerHTML = selectedProofFiles.map((file, idx) => {
        const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
        const iconSvg = isPdf
          ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--gold);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`
          : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #38bdf8;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;

        return `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(217, 180, 90, 0.25); border-radius: 8px; padding: 0.55rem 0.85rem; font-size: 0.85rem;">
            <div style="display: flex; align-items: center; gap: 0.65rem; min-width: 0; overflow: hidden;">
              <span style="display: flex; align-items: center; flex-shrink: 0;">${iconSvg}</span>
              <div style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <span style="color: #ffffff; font-weight: 600;">${escapeHtml(file.name)}</span>
                <span style="color: rgba(242, 244, 255, 0.5); font-size: 0.76rem; margin-left: 0.4rem;">(${formatBytes(file.size)})</span>
              </div>
            </div>
            <button
              type="button"
              class="proof-remove-btn btn-interactive"
              data-index="${idx}"
              title="Remove file"
              aria-label="Remove ${escapeHtml(file.name)}"
              style="background: transparent; border: none; color: rgba(242, 244, 255, 0.65); cursor: pointer; padding: 0.25rem 0.45rem; font-size: 0.95rem; border-radius: 4px; flex-shrink: 0; line-height: 1;"
            >
              ✕
            </button>
          </div>
        `;
      }).join('');

      fileListEl.querySelectorAll('.proof-remove-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(btn.getAttribute('data-index') || '-1', 10);
          if (idx >= 0 && idx < selectedProofFiles.length) {
            selectedProofFiles.splice(idx, 1);
            clearProofError();
            renderSelectedFilesList();
          }
        });
      });
    };

    const handleNewFiles = (files: FileList | File[]) => {
      clearProofError();
      const incoming = Array.from(files);
      if (incoming.length === 0) return;

      if (selectedProofFiles.length + incoming.length > MAX_FILE_COUNT) {
        showProofError(`Maximum ${MAX_FILE_COUNT} files allowed. You already selected ${selectedProofFiles.length} file(s) and attempted to add ${incoming.length} more.`);
        return;
      }

      for (const f of incoming) {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';
        const isValidExt = ALLOWED_EXTENSIONS.includes(ext);
        const isValidMime = ALLOWED_MIME_TYPES.includes(f.type) || (f.type === '' && isValidExt);

        if (!isValidExt || !isValidMime) {
          showProofError(`"${f.name}" isn't allowed. Please upload only PDF, PNG, JPG, or WebP files.`);
          return;
        }

        if (f.size > MAX_FILE_SIZE_BYTES) {
          showProofError(`"${f.name}" is over 5 MB (${formatBytes(f.size)}). Max allowed size is 5 MB per file.`);
          return;
        }

        const isDuplicate = selectedProofFiles.some((existing) => existing.name === f.name && existing.size === f.size);
        if (isDuplicate) {
          showProofError(`"${f.name}" has already been selected.`);
          return;
        }
      }

      selectedProofFiles.push(...incoming);
      renderSelectedFilesList();
    };

    dropzone?.addEventListener('click', () => {
      fileInput?.click();
    });

    dropzone?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput?.click();
      }
    });

    fileInput?.addEventListener('change', () => {
      if (fileInput.files) {
        handleNewFiles(fileInput.files);
        fileInput.value = '';
      }
    });

    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--gold)';
      dropzone.style.background = 'rgba(217, 180, 90, 0.12)';
    });

    dropzone?.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(217, 180, 90, 0.45)';
      dropzone.style.background = 'rgba(11, 15, 42, 0.65)';
    });

    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(217, 180, 90, 0.45)';
      dropzone.style.background = 'rgba(11, 15, 42, 0.65)';
      if (e.dataTransfer?.files) {
        handleNewFiles(e.dataTransfer.files);
      }
    });

    renderSelectedFilesList();
  }

  // Attach Form Submit Handler
  const form = document.getElementById('team-application-form') as HTMLFormElement | null;
  const submitBtn = document.getElementById('ta-submit-btn') as HTMLButtonElement | null;
  const feedback = document.getElementById('team-form-feedback');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!feedback) return;

    feedback.style.display = 'none';

    const fullName = (document.getElementById('ta-fullname') as HTMLInputElement | null)?.value || '';
    const email = (document.getElementById('ta-email') as HTMLInputElement | null)?.value || '';
    const phone = (document.getElementById('ta-phone') as HTMLInputElement | null)?.value || '';

    // Agreement checkbox is only required for the Security application
    if (!isVolunteer) {
      const agreement = (document.getElementById('ta-agreement') as HTMLInputElement | null)?.checked;
      if (!agreement) {
        feedback.className = 'status-banner status-error';
        feedback.textContent = 'Please confirm the agreement checkbox to submit your application.';
        feedback.style.display = 'block';
        return;
      }
    }

    // Collect answers
    const answers: Record<string, any> = {};
    for (const q of questions) {
      const el = document.getElementById(`ta-${q.id}`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (el) {
        answers[q.id] = el.value.trim();
      }
    }

    // Additional experiences validation & collection (Volunteer only)
    if (isVolunteer) {
      const expContainer = document.getElementById('ta-additional-experiences-container');
      const extraExperiences: Array<{ event: string; role?: string; when?: string; description?: string }> = [];

      if (expContainer) {
        const cards = expContainer.querySelectorAll('.extra-exp-card');
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i] as HTMLElement;
          const expNumber = i + 2;
          const eventInput = card.querySelector('.exp-event-input') as HTMLInputElement | null;
          const roleInput = card.querySelector('.exp-role-input') as HTMLInputElement | null;
          const whenInput = card.querySelector('.exp-when-input') as HTMLInputElement | null;
          const descInput = card.querySelector('.exp-desc-input') as HTMLTextAreaElement | null;
          const cardError = card.querySelector('.exp-card-error') as HTMLElement | null;

          if (cardError) {
            cardError.textContent = '';
            cardError.style.display = 'none';
          }

          const eventVal = eventInput?.value.trim() || '';
          const roleVal = roleInput?.value.trim() || '';
          const whenVal = whenInput?.value.trim() || '';
          const descVal = descInput?.value.trim() || '';

          // Completely empty cards are ignored and not saved
          if (!eventVal && !roleVal && !whenVal && !descVal) {
            continue;
          }

          // If a card is started but "Event or organisation" is empty, show a red message and block submit
          if (!eventVal) {
            const errorMsg = `Please enter the Event or organisation name for Experience ${expNumber}.`;
            if (cardError) {
              cardError.textContent = errorMsg;
              cardError.style.display = 'block';
            }
            feedback.className = 'status-banner status-error';
            feedback.textContent = errorMsg;
            feedback.style.display = 'block';
            eventInput?.focus();
            return; // Block submit!
          }

          extraExperiences.push({
            event: eventVal,
            ...(roleVal ? { role: roleVal } : {}),
            ...(whenVal ? { when: whenVal } : {}),
            ...(descVal ? { description: descVal } : {})
          });
        }
      }

      answers['additional_experiences'] = extraExperiences;
    }

    // Upload proof files if any (volunteer form only)
    const uploadedProofPaths: string[] = [];
    if (isVolunteer && selectedProofFiles.length > 0) {
      const progressContainer = document.getElementById('ta-proof-progress-container');
      const progressBar = document.getElementById('ta-proof-progress-bar');
      const progressLabel = document.getElementById('ta-proof-progress-label');
      const progressPercent = document.getElementById('ta-proof-progress-percent');

      if (progressContainer) progressContainer.style.display = 'block';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Uploading Proof Files...';
      }

      try {
        for (let i = 0; i < selectedProofFiles.length; i++) {
          const file = selectedProofFiles[i];
          const pct = Math.round((i / selectedProofFiles.length) * 100);
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (progressPercent) progressPercent.textContent = `${pct}%`;
          if (progressLabel) progressLabel.textContent = `Uploading ${file.name} (${i + 1}/${selectedProofFiles.length})...`;

          const uuid = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Math.random().toString(36).substring(2, 10)}-${Date.now()}`;
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
          const storagePath = `uploads/${uuid}-${sanitizedName}`;

          const { error: uploadErr } = await supabase.storage
            .from('application-proofs')
            .upload(storagePath, file, { cacheControl: '3600', upsert: false });

          if (uploadErr) {
            throw new Error(`Upload failed for "${file.name}": ${uploadErr.message || 'Storage upload error'}`);
          }

          uploadedProofPaths.push(storagePath);
        }

        if (progressBar) progressBar.style.width = '100%';
        if (progressPercent) progressPercent.textContent = '100%';
        if (progressLabel) progressLabel.textContent = 'Uploads complete! Saving application...';
      } catch (uploadErr: any) {
        if (progressContainer) progressContainer.style.display = 'none';
        feedback.className = 'status-banner status-error';
        feedback.textContent = uploadErr?.message || 'Failed to upload proof files. Please try again.';
        feedback.style.display = 'block';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = `Submit ${activeTeamTab === 'volunteer' ? 'Volunteer' : 'Security'} Application`;
        }
        return; // Do NOT submit the application if an upload fails!
      }
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting Application...';
    }

    const res = await submitTeamApplication({
      team: activeTeamTab,
      full_name: fullName,
      email,
      phone,
      answers,
      proof_files: uploadedProofPaths
    });

    if (res.error) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = res.error;
      feedback.style.display = 'block';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = `Submit ${activeTeamTab === 'volunteer' ? 'Volunteer' : 'Security'} Application`;
      }
    } else {
      selectedProofFiles = [];
      formSubmittedSuccess = {
        name: fullName,
        team: activeTeamTab,
        email
      };
      renderTeamApplyPage(container);
    }
  });
}
