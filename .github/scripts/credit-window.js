function isCreditWindowOpen(now = new Date()) {
    if (!Number.isFinite(now.getTime())) {
        throw new Error('Invalid credit window time');
    }
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Jerusalem',
        weekday: 'short',
        hour: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(now);
    const weekday = parts.find(part => part.type === 'weekday').value;
    const hour = Number(parts.find(part => part.type === 'hour').value);
    return weekday !== 'Fri' && weekday !== 'Sat' && hour >= 9 && hour < 18;
}

module.exports = { isCreditWindowOpen };
