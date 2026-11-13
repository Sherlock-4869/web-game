/* ============================================================
   economy.js — gold, lives, interest, refunds.
   ============================================================ */
(function (TD) {
  class Economy {
    constructor(difficulty) {
      const d = TD.DIFFICULTY[difficulty] || TD.DIFFICULTY.normal;
      this.gold = d.gold;
      this.lives = d.lives;
      this.maxLives = d.lives;
      this.rewardMul = d.rewardMul;
      this.totalEarned = 0;
      this.totalSpent = 0;
    }
    canAfford(cost) { return this.gold >= cost; }
    spend(cost) {
      if (this.gold < cost) return false;
      this.gold -= cost; this.totalSpent += cost; return true;
    }
    earn(amount) {
      amount = Math.round(amount * this.rewardMul);
      this.gold += amount; this.totalEarned += amount; return amount;
    }
    refund(amount) { this.gold += amount; }
    loseLife(n = 1) { this.lives = Math.max(0, this.lives - n); return this.lives <= 0; }
    /* Banking interest every N waves. */
    applyInterest() {
      const interest = Math.min(
        Math.floor(this.gold * TD.CONFIG.interestRate),
        TD.CONFIG.interestCap
      );
      if (interest > 0) this.earn(interest);
      return interest;
    }
    serialize() {
      return { gold: this.gold, lives: this.lives, maxLives: this.maxLives,
        rewardMul: this.rewardMul, totalEarned: this.totalEarned, totalSpent: this.totalSpent };
    }
    load(s) { Object.assign(this, s); }
  }
  TD.Economy = Economy;
})(window.TD);
