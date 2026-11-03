const TEST_SCHEDULE = '10,15,20,25,30,35,40,45,50,55 15 3 11 *';
const TEST_START = Date.parse('2026-11-03T17:10:00+02:00');
const TEST_END = Date.parse('2026-11-03T18:00:00+02:00');
const TEST_DAY_START = Date.parse('2026-11-03T00:00:00+02:00');
const TEST_DAY_END = Date.parse('2026-11-04T00:00:00+02:00');

function isCreditWindowOpen(now = new Date(), schedule = process.env.TRIGGER_SCHEDULE) {
    const time = now.getTime();
    if (!Number.isFinite(time)) {
        throw new Error('Invalid credit window time');
    }
    if (schedule === TEST_SCHEDULE) {
        return time >= TEST_START && time < TEST_END;
    }
    if (time >= TEST_DAY_START && time < TEST_DAY_END) {
        return time >= TEST_START && time < TEST_END;
    }
    return true;
}

module.exports = { isCreditWindowOpen, TEST_SCHEDULE };
