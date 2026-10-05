import { describe, expect, it } from 'vitest';
import { buildQrLoginIssueUrl, formatQrLoginDiagnosticReport } from '@/utils/qrLoginDiagnosticReport';

// test/unit/onlineMusic/qrLoginDiagnosticReport.test.ts

const AT = Date.UTC(2026, 8, 26, 12, 0, 0);

describe('QR login diagnostic report', () => {
    it('wraps the report in a code block ready to paste into an issue', () => {
        const report = formatQrLoginDiagnosticReport({
            generatedAt: AT,
            appVersion: '1.2.3',
            userAgent: 'test-agent',
            providerId: 'qq',
            methodId: null,
            failure: 'check-error',
            timeline: [{ at: AT, event: 'state', detail: { state: 'error', message: 'code 404: Not Found', elapsedMs: 2000 } }],
            providerLines: ['runtime: web'],
        });

        expect(report.split('\n')).toEqual([
            '### Folia QR login diagnostics',
            '',
            '```text',
            'generated: 2026-09-26T12:00:00.000Z',
            'app: 1.2.3',
            'user agent: test-agent',
            'provider: qq',
            'failure: check-error',
            'QR session timeline (1, UTC):',
            '  12:00:00.000 state state=error message="code 404: Not Found" elapsedMs=2000',
            'qq details:',
            '  runtime: web',
            '```',
        ]);
    });

    it('puts a short report into the issue link and falls back to a paste hint when it is too long', () => {
        const short = new URL(buildQrLoginIssueUrl({ providerId: 'qq', report: 'short report', pasteHint: 'paste here' }));
        expect(short.searchParams.get('title')).toBe('[QR login] qq login failed');
        expect(short.searchParams.get('body')).toBe('short report');

        const long = new URL(buildQrLoginIssueUrl({ providerId: 'qq', report: 'x'.repeat(10_000), pasteHint: 'paste here' }));
        expect(long.searchParams.get('body')).toBe('paste here');

        const empty = new URL(buildQrLoginIssueUrl({ providerId: 'qq', report: '', pasteHint: 'paste here' }));
        expect(empty.searchParams.get('body')).toBe('paste here');
    });
});
