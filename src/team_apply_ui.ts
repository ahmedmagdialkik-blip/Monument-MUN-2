import {
  VOLUNTEER_QUESTIONS,
  SECURITY_QUESTIONS,
  OTHER_TEAMS,
  submitTeamApplication,
  type QuestionDef
} from './team_applications';
import type { TeamAppRole } from './types/database';

function escapeHtml(str?: string | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let activeTeamTab: TeamAppRole = 'volunteer';
let formSubmittedSuccess: { name: string; team: string; email: string } | null = null;

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

    document.getElementById('team-apply-another-btn')?.addEventListener('click', () => {
      formSubmittedSuccess = null;
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

                if (q.type === 'select') {
                  return `
                    <div class="form-group">
                      <label class="form-label" for="ta-${q.id}">${escapeHtml(q.label)} ${q.required ? '*' : ''}</label>
                      ${sublabel}
                      <select id="ta-${q.id}" class="form-select" required>
                        <option value="">-- Please select an option --</option>
                        ${(q.options || []).map((opt) => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
                      </select>
                    </div>
                  `;
                }

                if (q.type === 'textarea') {
                  return `
                    <div class="form-group">
                      <label class="form-label" for="ta-${q.id}">${escapeHtml(q.label)} ${q.required ? '*' : ''}</label>
                      ${sublabel}
                      <textarea id="ta-${q.id}" class="form-textarea" rows="3" placeholder="${escapeHtml(q.placeholder || '')}" required></textarea>
                    </div>
                  `;
                }

                return `
                  <div class="form-group">
                    <label class="form-label" for="ta-${q.id}">${escapeHtml(q.label)} ${q.required ? '*' : ''}</label>
                    ${sublabel}
                    <input type="text" id="ta-${q.id}" class="form-input" placeholder="${escapeHtml(q.placeholder || '')}" required />
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Code of Conduct Checkbox -->
          <div style="margin-bottom: 2rem; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 1.25rem;">
            <label style="display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer; font-size: 0.88rem; color: rgba(242, 244, 255, 0.85); line-height: 1.5;">
              <input type="checkbox" id="ta-agreement" required style="margin-top: 0.25rem; accent-color: var(--gold);" />
              <span>
                I confirm that all responses provided above are accurate and truthful. If accepted, I commit to attending scheduled preparation sessions and upholding the integrity and decorum of Monument MUN 2027.
              </span>
            </label>
          </div>

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

  // Attach card toggle listeners (both click and keyboard accessibility)
  const volCard = document.getElementById('select-team-volunteer');
  const secCard = document.getElementById('select-team-security');

  const selectVolunteer = () => {
    if (activeTeamTab !== 'volunteer') {
      activeTeamTab = 'volunteer';
      renderTeamApplyPage(container);
    }
  };

  const selectSecurity = () => {
    if (activeTeamTab !== 'security') {
      activeTeamTab = 'security';
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
    const agreement = (document.getElementById('ta-agreement') as HTMLInputElement | null)?.checked;

    if (!agreement) {
      feedback.className = 'status-banner status-error';
      feedback.textContent = 'Please confirm the agreement checkbox to submit your application.';
      feedback.style.display = 'block';
      return;
    }

    // Collect answers
    const answers: Record<string, string> = {};
    for (const q of questions) {
      const el = document.getElementById(`ta-${q.id}`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
      if (el) {
        answers[q.id] = el.value.trim();
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
      answers
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
      formSubmittedSuccess = {
        name: fullName,
        team: activeTeamTab,
        email
      };
      renderTeamApplyPage(container);
    }
  });
}
