const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const utils = require('./github-actions-utils');
const CreditLoader = require('./github-load-credit');
const TokenRefresh = require('./github-refresh-token');
const { guardCreditRun, israelDate } = require('./.github/scripts/credit-run-guard');
const { isCreditWindowOpen, TEST_SCHEDULE } = require('./.github/scripts/credit-test-window');

test('one-day automatic test allows only 17:10 inclusive through 18:00 exclusive Israel time', () => {
    for (const schedule of [undefined, TEST_SCHEDULE, '17 7,10,13 * * 0,1,2,3,4']) {
        assert.equal(isCreditWindowOpen(new Date('2026-11-03T17:09:59+02:00'), schedule), false);
        assert.equal(isCreditWindowOpen(new Date('2026-11-03T17:10:00+02:00'), schedule), true);
        assert.equal(isCreditWindowOpen(new Date('2026-11-03T17:59:59+02:00'), schedule), true);
        assert.equal(isCreditWindowOpen(new Date('2026-11-03T18:00:00+02:00'), schedule), false);
        assert.equal(isCreditWindowOpen(new Date('2026-11-03T23:59:59+02:00'), schedule), false);
    }
});

test('late test runs cannot pay the following day or recur the following year', () => {
    for (const date of ['2026-11-04T09:17:00+02:00', '2027-11-03T17:15:00+02:00']) {
        assert.equal(isCreditWindowOpen(new Date(date), TEST_SCHEDULE), false);
        assert.equal(isCreditWindowOpen(new Date(date), '17 7,10,13 * * 0,1,2,3,4'), true);
    }
    assert.throws(() => isCreditWindowOpen(new Date('invalid')), /Invalid credit window time/);
});

const originalSkipDates = process.env.CREDIT_SKIP_DATES;
afterEach(() => {
    if (originalSkipDates === undefined) {
        delete process.env.CREDIT_SKIP_DATES;
    } else {
        process.env.CREDIT_SKIP_DATES = originalSkipDates;
    }
});

function guardFixture(runs = [], jobs = {}) {
    const calls = [];
    const failures = [];
    const messages = [];
    const actions = {
        listWorkflowRuns: Symbol('runs'),
        listJobsForWorkflowRun: Symbol('jobs')
    };
    const github = {
        rest: { actions },
        async paginate(method, options) {
            calls.push(options);
            return method === actions.listWorkflowRuns ? runs : (jobs[options.run_id] || []);
        }
    };
    const core = {
        notice: message => messages.push(message),
        info: message => messages.push(message),
        setFailed: message => failures.push(message),
        summary: {
            addRaw(message) { messages.push(message); return this; },
            async write() {}
        }
    };
    process.env.CREDIT_SKIP_DATES = '';
    return {
        github, core, calls, failures, messages,
        context: { repo: { owner: 'owner', repo: 'repo' }, runId: 20 },
        now: new Date('2026-11-02T10:00:00Z')
    };
}

function creditStep(conclusion = 'success', started = '2026-11-02T07:20:00Z') {
    return {
        name: 'Run credit loading with fresh tokens',
        conclusion, started_at: started,
        completed_at: conclusion === null ? null : started
    };
}

function mockUtils(t) {
    const config = {
        AccessToken: 'test-access-token-value',
        RefreshToken: 'test-refresh-token-value',
        Amount: '25', MoneycardId: '123'
    };
    t.mock.method(utils, 'log', async () => {});
    t.mock.method(utils, 'setOutput', async () => {});
    t.mock.method(utils, 'maskValue', () => {});
    t.mock.method(utils, 'getConfig', () => config);
    t.mock.method(utils, 'isWeekend', () => false);
    t.mock.method(CreditLoader.prototype, 'initializeTeamsWebhook', async () => {});
    t.mock.method(require('./.github/scripts/credit-test-window'), 'isCreditWindowOpen', () => true);
    return config;
}

test('allows the first daily run and queries paginated history', async () => {
    const fixture = guardFixture();
    assert.equal(await guardCreditRun(fixture), true);
    assert.equal(fixture.calls[0].workflow_id, 'load-credit.yml');
    assert.equal(fixture.calls[0].per_page, 100);
    assert.match(fixture.calls[0].created, /^>=/);
});

test('automatic test outside its window skips before querying history', async () => {
    const fixture = guardFixture();
    fixture.context.payload = { schedule: TEST_SCHEDULE };
    for (const time of ['2026-11-03T15:09:59Z', '2026-11-03T16:00:00Z', '2026-11-04T15:15:00Z']) {
        fixture.now = new Date(time);
        assert.equal(await guardCreditRun(fixture), false);
    }
    assert.equal(fixture.calls.length, 0);
    fixture.now = new Date('2026-11-03T15:10:00Z');
    assert.equal(await guardCreditRun(fixture), true);
});

test('late payment startup fails before sending a payment request', async t => {
    mockUtils(t);
    require('./.github/scripts/credit-test-window').isCreditWindowOpen.mock.mockImplementation(() => false);
    const request = t.mock.method(utils, 'makeHttpRequest', async () => ({ status: 200 }));
    await assert.rejects(new CreditLoader().loadCredit(), /Payment not sent/);
    assert.equal(request.mock.calls.length, 0);
});

test('blocks a duplicate even when log upload made the overall run fail', async () => {
    const fixture = guardFixture([{ id: 1, conclusion: 'failure', html_url: 'run/1' }], {
        1: [{ steps: [creditStep()] }]
    });
    assert.equal(await guardCreditRun(fixture), false);
    assert.equal(fixture.failures.length, 0);
    assert.equal(fixture.calls[1].filter, 'all');
});

test('failed, cancelled and unfinished payment attempts block automatic retries', async () => {
    for (const conclusion of ['failure', 'cancelled', null]) {
        const fixture = guardFixture([{ id: 1, html_url: 'run/1' }], {
            1: [{ steps: [creditStep(conclusion)] }]
        });
        assert.equal(await guardCreditRun(fixture), false);
        assert.match(fixture.failures[0], /Result uncertain/);
    }
});

test('a same-run rerun cannot bypass the payment guard', async () => {
    const fixture = guardFixture([{ id: 20, html_url: 'run/20' }], {
        20: [{ run_attempt: 1, steps: [creditStep()] }, { run_attempt: 2, steps: [] }]
    });
    assert.equal(await guardCreditRun(fixture), false);
});

test('allows a fallback when a previous run failed before payment or skipped payment', async () => {
    for (const steps of [[], [creditStep('skipped')]]) {
        const fixture = guardFixture([{ id: 1, html_url: 'run/1' }], { 1: [{ steps }] });
        assert.equal(await guardCreditRun(fixture), true);
    }
});

test('uses Israel calendar dates, including midnight and DST boundaries', () => {
    assert.equal(israelDate('2026-11-01T22:30:00Z'), '2026-11-02');
    assert.equal(israelDate('2026-07-01T21:30:00Z'), '2026-07-02');
    assert.equal(utils.isWeekend(new Date('2026-11-05T22:30:00Z')), true);
    assert.equal(utils.isWeekend(new Date('2026-11-07T22:30:00Z')), false);
});

test('counts a load spanning Israel midnight on both days', async () => {
    const step = creditStep('success', '2026-11-01T21:59:00Z');
    step.completed_at = '2026-11-01T22:01:00Z';
    const fixture = guardFixture([{ id: 1, html_url: 'run/1' }], { 1: [{ steps: [step] }] });
    assert.equal(await guardCreditRun(fixture), false);
});

test('yesterday loading does not prevent today loading', async () => {
    const fixture = guardFixture([{ id: 1, html_url: 'run/1' }], {
        1: [{ steps: [creditStep('success', '2026-11-01T07:20:00Z')] }]
    });
    assert.equal(await guardCreditRun(fixture), true);
});

test('manual-load exclusions and Israel weekends skip before querying history', async () => {
    for (const date of ['2026-11-02T10:00:00Z', '2026-11-06T10:00:00Z', '2026-11-07T10:00:00Z']) {
        const fixture = guardFixture();
        fixture.now = new Date(date);
        process.env.CREDIT_SKIP_DATES = '2026-11-02, 2026-11-03';
        assert.equal(await guardCreditRun(fixture), false);
        assert.equal(fixture.calls.length, 0);
    }
});

test('invalid exclusions and unreadable history fail closed', async () => {
    const fixture = guardFixture();
    process.env.CREDIT_SKIP_DATES = 'not-a-date';
    await assert.rejects(guardCreditRun(fixture), /CREDIT_SKIP_DATES/);
    process.env.CREDIT_SKIP_DATES = '';
    fixture.github.paginate = async () => { throw new Error('Permission denied'); };
    await assert.rejects(guardCreditRun(fixture), /Permission denied/);
});

test('credit loader sends fresh configured tokens and makes one payment attempt', async t => {
    const config = mockUtils(t);
    const request = t.mock.method(utils, 'makeHttpRequest', async () => ({ status: 200 }));
    await new CreditLoader().loadCredit();
    assert.equal(request.mock.calls.length, 1);
    const [options, retries] = request.mock.calls[0].arguments;
    assert.equal(retries, 1);
    assert.equal(options.headers.Authorization, `Bearer ${config.AccessToken}`);
    assert.match(options.headers.Cookie, new RegExp(config.RefreshToken));
    assert.deepEqual(options.data, { amount: 25, moneycardIdToCharge: 123 });
});

test('invalid amounts and card IDs are rejected before any HTTP call', async t => {
    const config = mockUtils(t);
    const request = t.mock.method(utils, 'makeHttpRequest', async () => ({ status: 200 }));
    for (const field of ['Amount', 'MoneycardId']) {
        const original = config[field];
        for (const value of ['0', '-1', '12abc', '2.5', '9007199254740992']) {
            config[field] = value;
            await assert.rejects(new CreditLoader().loadCredit(), /positive safe integer/);
        }
        config[field] = original;
    }
    assert.equal(request.mock.calls.length, 0);
});

test('unexpected payment responses and timeouts propagate failure', async t => {
    mockUtils(t);
    const request = t.mock.method(utils, 'makeHttpRequest', async () => ({ status: 202 }));
    await assert.rejects(new CreditLoader().loadCredit(), /Unexpected response status: 202/);
    request.mock.mockImplementation(async () => { throw new Error('Request timed out'); });
    await assert.rejects(new CreditLoader().loadCredit(), /Request timed out/);
    assert.equal(request.mock.calls.length, 2);
});

test('refresh returning no access token cannot succeed or update configuration', async t => {
    mockUtils(t);
    const update = t.mock.method(utils, 'updateConfig', async () => {});
    t.mock.method(utils, 'makeHttpRequest', async () => ({
        status: 200, headers: {}, data: { Amount: 25 }
    }));
    await assert.rejects(new TokenRefresh().refreshTokens(), /no access token/);
    assert.equal(update.mock.calls.length, 0);
});

test('refresh preserves both rotated tokens from cookies', async t => {
    mockUtils(t);
    const update = t.mock.method(utils, 'updateConfig', async () => {});
    t.mock.method(utils, 'makeHttpRequest', async () => ({
        status: 200,
        headers: { 'set-cookie': ['Authorization=new-access-token; Path=/', 'RefreshToken=new-refresh-token; Path=/'] },
        data: {}
    }));
    await new TokenRefresh().refreshTokens();
    assert.deepEqual(update.mock.calls[0].arguments[0], {
        AccessToken: 'new-access-token', RefreshToken: 'new-refresh-token'
    });
});
