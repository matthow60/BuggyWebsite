// Splits an order total between you and the friends you list.

function splitPayment(total, payers) {
  const friends = (payers || []).map((name) => String(name).trim()).filter(Boolean);
  const people = friends.length + 1; // you + friends

  const cents = Math.round(total * 100);
  const share = Math.floor(cents / people);
  const leftover = cents - share * people; // you cover the odd cents

  return {
    people,
    shares: [
      { name: 'You', amount: (share + leftover) / 100 },
      ...friends.map((name) => ({ name, amount: share / 100 })),
    ],
  };
}

module.exports = { splitPayment };
