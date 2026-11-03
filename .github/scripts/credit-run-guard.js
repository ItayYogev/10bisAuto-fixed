const { isCreditWindowOpen } = require('./credit-test-window');

function israelDate(value) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date(value));
    return ['year', 'month', 'day']
        .map(type => parts.find(part => part.type === type).value).join('-');
}

async function guardCreditRun({ github, context, core, now = new Date() }) {
    if (!isCreditWindowOpen(now, context.payload?.schedule)) {
        core.notice('Skipping credit loading: outside the authorized 2026-11-03 17:10-18:00 Israel test window.');
        return false;
    }
    const today = israelDate(now);
    const skipDates = (process.env.CREDIT_SKIP_DATES || '')
        .split(',').map(value => value.trim()).filter(Boolean);
    if (skipDates.some(value => !/^\d{4}-\d{2}-\d{2}$/.test(value))) {
        throw new Error('CREDIT_SKIP_DATES must contain comma-separated YYYY-MM-DD dates');
    }

    const weekday = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem', weekday: 'short'
    }).format(now);
    if (skipDates.includes(today) || weekday === 'Fri' || weekday === 'Sat') {
        core.notice(`Skipping credit loading on ${today}: manual-load exclusion or weekend.`);
        await core.summary.addRaw(`Credit loading skipped for ${today} (Israel time).`).write();
        return false;
    }

    // Include older runs that may have been queued across midnight.
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const runs = await github.paginate(github.rest.actions.listWorkflowRuns, {
        ...context.repo,
        workflow_id: 'load-credit.yml',
        created: `>=${since}`,
        per_page: 100
    });

    for (const run of runs) {
        const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRun, {
            ...context.repo,
            run_id: run.id,
            filter: 'all',
            per_page: 100
        });
        for (const job of jobs) {
            const attempt = (job.steps || []).find(step =>
                step.name === 'Run credit loading with fresh tokens' &&
                step.started_at && step.conclusion !== 'skipped' &&
                [step.started_at, step.completed_at]
                    .some(time => time && israelDate(time) === today)
            );
            if (!attempt) {
                continue;
            }

            const message = `Credit loading already attempted on ${today}: ${run.html_url}`;
            await core.summary.addRaw(`${message}\n\nNo additional payment request will be sent.`).write();
            if (attempt.conclusion === 'success') {
                core.notice(message);
            } else {
                core.setFailed(`${message}. Result uncertain; verify the balance manually before any further load.`);
            }
            return false;
        }
    }

    core.info(`No previous credit loading attempt found for ${today}.`);
    return true;
}

module.exports = { guardCreditRun, israelDate };
