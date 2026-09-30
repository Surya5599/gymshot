import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval('daily reminders', { minutes: 15 }, internal.push.runReminders, {});

export default crons;
