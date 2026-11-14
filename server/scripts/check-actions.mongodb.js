// MongoDB for VS Code playground: shows the user actions on the newest incidents.
// Connect to your team's cluster in the MongoDB sidebar, open this file, and click ▷ Run.
// Read-only.

use('hackuta');

db.getCollection('incidents')
  .find(
    {},
    {
      incidentId: 1,
      status: 1,
      route: 1,
      createdAt: 1,
      'error.message': 1,
      actionCount: { $size: { $ifNull: ['$actions', []] } },
      actions: { type: 1, target: 1, value: 1, url: 1, t: 1 },
    }
  )
  .sort({ createdAt: -1 })
  .limit(3);
