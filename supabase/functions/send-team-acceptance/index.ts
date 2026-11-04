// Supabase Edge Function: send-team-acceptance
// Deployed to: https://<project-ref>.supabase.co/functions/v1/send-team-acceptance
// Environment secrets required:
// - RESEND_API_KEY (from https://resend.com)
// - RESEND_FROM_EMAIL (optional, defaults to "Monument MUN <onboarding@resend.dev>" or your verified domain)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailPayload {
  applicationId: string;
  recipientEmail: string;
  recipientName: string;
  team: "volunteer" | "security";
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({
          error: "RESEND_API_KEY is not configured in Supabase Edge Function secrets.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const payload: EmailPayload = await req.json();
    const { recipientEmail, recipientName, team } = payload;

    if (!recipientEmail || !recipientName || !team) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: recipientEmail, recipientName, team",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const teamDisplayName = team === "security" ? "Security Team" : "Volunteer Team";
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "Monument MUN <onboarding@resend.dev>";

    // Build the responsive Navy (#080a1e) & Gold (#d9b45a) branded HTML template
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're in! Welcome to the Monument MUN team</title>
</head>
<body style="margin: 0; padding: 0; background-color: #04050d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #f2f4ff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #04050d; padding: 30px 15px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #080a1e; border: 1px solid rgba(217, 180, 90, 0.4); border-radius: 16px; overflow: hidden; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);">
          
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0b0f2a 0%, #171d42 100%); padding: 36px 30px; text-align: center; border-bottom: 2px solid #d9b45a;">
              <div style="font-family: 'Cinzel', Georgia, serif; font-size: 13px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: #d9b45a; margin-bottom: 8px;">
                ✦ MONUMENT MODEL UNITED NATIONS 2027 ✦
              </div>
              <h1 style="margin: 0; font-family: 'Cinzel', Georgia, serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: 0.08em; text-transform: uppercase;">
                OFFICIAL APPOINTMENT NOTICE
              </h1>
              <div style="display: inline-block; margin-top: 14px; background: rgba(217, 180, 90, 0.16); border: 1px solid #d9b45a; border-radius: 9999px; padding: 6px 18px; color: #d9b45a; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;">
                ${teamDisplayName}
              </div>
            </td>
          </tr>

          <!-- Body Content -->
          <tr>
            <td style="padding: 36px 32px; font-size: 15px; line-height: 1.7; color: rgba(242, 244, 255, 0.9);">
              <p style="margin-top: 0; font-size: 18px; color: #ffffff; font-weight: 700;">
                Dear ${escapeHtml(recipientName)},
              </p>

              <p>
                On behalf of the Secretariat and the Executive Board of <strong>Monument Model United Nations 2027</strong>, we are thrilled to inform you that your application has been officially accepted!
              </p>

              <div style="background: rgba(217, 180, 90, 0.08); border-left: 4px solid #d9b45a; border-radius: 6px; padding: 18px 20px; margin: 24px 0;">
                <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.14em; color: #d9b45a; font-weight: 800;">
                  CONFIRMED ROSTER ASSIGNMENT
                </div>
                <div style="font-size: 20px; font-weight: 800; color: #ffffff; margin-top: 4px;">
                  ${teamDisplayName}
                </div>
                <div style="font-size: 13px; color: rgba(242, 244, 255, 0.7); margin-top: 4px;">
                  Monument MUN 2027 · Cairo Assembly
                </div>
              </div>

              <p>
                Your dedication, skills, and answers stood out among our applicants. As a vital member of our <strong>${teamDisplayName}</strong>, you will play an indispensable role in maintaining the highest standards of conference excellence, security, and diplomatic hospitality.
              </p>

              <!-- Next Steps Notice -->
              <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px; margin: 24px 0;">
                <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: #d9b45a; margin-bottom: 6px;">
                  What Happens Next?
                </div>
                <p style="margin: 0; font-size: 14px; line-height: 1.6; color: rgba(242, 244, 255, 0.85);">
                  We will contact you with next steps shortly regarding your orientation schedule, department briefing documents, and venue access credentials. Please keep an eye on this email address.
                </p>
              </div>

              <p style="margin-bottom: 0;">
                Once again, welcome to the Monument MUN family. We look forward to working alongside you.
              </p>
            </td>
          </tr>

          <!-- Signoff & Footer -->
          <tr>
            <td style="padding: 24px 32px 36px 32px; border-top: 1px solid rgba(217, 180, 90, 0.2); background-color: #050714;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size: 14px; font-weight: 700; color: #ffffff;">The Secretariat</div>
                    <div style="font-size: 12px; color: #d9b45a; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px;">Monument Model United Nations 2027</div>
                    <div style="font-size: 12px; color: rgba(242, 244, 255, 0.5); margin-top: 4px;">Where every monument has a seat.</div>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <div style="font-size: 24px; color: #d9b45a;">✦</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Micro Footer -->
        <table role="presentation" width="100%" style="max-width: 600px; margin-top: 18px;">
          <tr>
            <td align="center" style="font-size: 11px; color: rgba(242, 244, 255, 0.4); line-height: 1.5;">
              This is an automated notification from Monument MUN. Please do not reply directly to this email.<br>
              &copy; 2027 Monument Model United Nations. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

    // Send email via Resend API
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [recipientEmail],
        subject: "You're in! Welcome to the Monument MUN team",
        html: htmlContent,
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend API error:", resendData);
      return new Response(
        JSON.stringify({
          error: resendData.message || "Failed to send email through Resend",
          details: resendData,
        }),
        {
          status: resendRes.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailId: resendData.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Unhandled Edge Function error:", errorMsg);
    return new Response(
      JSON.stringify({ error: errorMsg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
