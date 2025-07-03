/**
 * @file blackjack-engine.ts
 * @description UI 프ramework에 독립적인, 확장 가능하고 견고한 순수 TypeScript 블랙잭 엔진.
 * 스플릿, 더블다운, 보험, 커스텀 규칙 등 모든 현대 블랙잭 기능을 지원합니다.
 * @version 2.0.0
 */

//-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Types & Enums (타입 및 열거형)
//-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

export type Card = {
  /** Rank: 1(A), 2-10, 11(J), 12(Q), 13(K) */
  rank: number;
  /** Suit: 0(Clubs), 1(Diamonds), 2(Hearts), 3(Spades) */
  suit: number;
};

/** 게임의 현재 단계를 나타내는 상태 머신입니다. */
export enum GamePhase {
  BETTING,
  PLAYER_TURN,
  DEALER_TURN,
  ROUND_OVER,
}

/** 각 핸드의 진행 상태를 나타냅니다. */
export enum HandStatus {
  ACTIVE, // 현재 플레이 중인 핸드
  STOOD, // 플레이어가 스탠드를 선언한 핸드
  BUST, // 21점을 초과하여 버스트된 핸드
  BLACKJACK, // 초기 2장으로 21점이 된 핸드
}

/** 각 핸드의 최종 결과를 나타냅니다. */
export enum HandResult {
  PENDING,
  PLAYER_WINS,
  DEALER_WINS,
  PUSH, // 무승부
}

/** 플레이어가 수행할 수 있는 모든 액션입니다. */
export enum PlayerAction {
  HIT,
  STAND,
  DOUBLE_DOWN,
  SPLIT,
  INSURANCE,
}

/** 스플릿을 포함한 여러 핸드를 관리하기 위한 객체입니다. */
export interface HandState {
  cards: Card[];
  bet: number;
  status: HandStatus;
  result: HandResult;
}

/** 게임의 전체 상태를 나타내는 스냅샷 객체입니다. */
export interface GameState {
  deckSize: number;
  playerHands: HandState[];
  dealerHand: Card[];
  /** 현재 플레이어의 액션 대상이 되는 핸드의 인덱스입니다. */
  activeHandIndex: number;
  phase: GamePhase;
  dealerUpCardValue: number;
  availableActions: PlayerAction[];
}

/** 게임 규칙을 설정하는 옵션 객체입니다. */
export interface GameOptions {
  /** 사용할 덱의 수 (e.g., 1, 4, 6, 8) */
  numberOfDecks: number;
  /** 딜러가 Soft 17일 때 Hit할지 여부 */
  dealerHitsOnSoft17: boolean;
  /** 블랙잭 성공 시 배당률 (e.g., 1.5 for 3:2, 1.2 for 6:5) */
  blackjackPayout: number;
}

type HandValue = {
  value: number;
  isSoft: boolean; // Ace가 11로 계산되었는지 여부
};

//-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// Core Game Class (핵심 게임 클래스)
//-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

export class BlackjackGame {
  private deck: Card[] = [];
  private playerHands: HandState[] = [];
  private dealerHand: Card[] = [];
  private activeHandIndex: number = 0;
  private phase: GamePhase = GamePhase.BETTING;
  private readonly options: GameOptions;

  /**
   * BlackjackGame의 새 인스턴스를 생성합니다.
   * @param options 게임 규칙을 정의하는 옵션 객체.
   */
  constructor(options?: Partial<GameOptions>) {
    this.options = {
      numberOfDecks: 4,
      dealerHitsOnSoft17: true,
      blackjackPayout: 1.5,
      ...options,
    };
    this.resetGame();
  }

  /** 게임을 초기 베팅 상태로 리셋합니다. */
  public resetGame(): void {
    this.deck = this.createNewDeck();
    this.playerHands = [];
    this.dealerHand = [];
    this.activeHandIndex = 0;
    this.phase = GamePhase.BETTING;
  }

  /**
   * 새 라운드를 시작합니다. 베팅 후 초기 카드를 딜링합니다.
   * @param betAmount 플레이어의 기본 베팅 금액.
   */
  public startRound(betAmount: number): void {
    if (this.phase !== GamePhase.BETTING && this.phase !== GamePhase.ROUND_OVER)
      return;
    if (betAmount <= 0) throw new Error("Bet amount must be positive.");

    // 덱에 카드가 1/3 미만으로 남으면 새로 셔플
    if (this.deck.length < (this.options.numberOfDecks * 52) / 3) {
      this.deck = this.createNewDeck();
    }

    this.playerHands = [
      {
        cards: [this.dealCard(), this.dealCard()],
        bet: betAmount,
        status: HandStatus.ACTIVE,
        result: HandResult.PENDING,
      },
    ];
    this.dealerHand = [this.dealCard(), this.dealCard()];
    this.activeHandIndex = 0;
    this.phase = GamePhase.PLAYER_TURN;

    // 초기 블랙잭 확인
    const playerHandValue = BlackjackGame.getHandValue(
      this.playerHands[0].cards
    );
    if (playerHandValue.value === 21) {
      this.playerHands[0].status = HandStatus.BLACKJACK;
      this.resolveDealerTurn();
    }
  }

  /** 플레이어가 Hit 액션을 수행합니다. */
  public hit(): void {
    if (!this.canPerformAction(PlayerAction.HIT)) return;

    const activeHand = this.getActiveHand();
    activeHand.cards.push(this.dealCard());

    if (BlackjackGame.getHandValue(activeHand.cards).value > 21) {
      activeHand.status = HandStatus.BUST;
      this.moveToNextHandOrResolve();
    }
  }

  /** 플레이어가 Stand 액션을 수행합니다. */
  public stand(): void {
    if (!this.canPerformAction(PlayerAction.STAND)) return;

    this.getActiveHand().status = HandStatus.STOOD;
    this.moveToNextHandOrResolve();
  }

  /** 플레이어가 Double Down 액션을 수행합니다. */
  public doubleDown(): void {
    if (!this.canPerformAction(PlayerAction.DOUBLE_DOWN)) return;

    const activeHand = this.getActiveHand();
    activeHand.bet *= 2;
    activeHand.cards.push(this.dealCard());

    activeHand.status =
      BlackjackGame.getHandValue(activeHand.cards).value > 21
        ? HandStatus.BUST
        : HandStatus.STOOD;

    this.moveToNextHandOrResolve();
  }

  /** 플레이어가 Split 액션을 수행합니다. */
  public split(): void {
    if (!this.canPerformAction(PlayerAction.SPLIT)) return;

    const activeHand = this.getActiveHand();
    const newHand: HandState = {
      cards: [activeHand.cards.pop()!], // 기존 핸드에서 카드 하나를 가져옴
      bet: activeHand.bet,
      status: HandStatus.ACTIVE,
      result: HandResult.PENDING,
    };

    // 각 핸드에 카드 한 장씩 추가
    activeHand.cards.push(this.dealCard());
    newHand.cards.push(this.dealCard());

    // 분리된 핸드를 현재 핸드 다음에 추가
    this.playerHands.splice(this.activeHandIndex + 1, 0, newHand);

    // 스플릿 후 블랙잭 여부 확인
    if (BlackjackGame.getHandValue(activeHand.cards).value === 21) {
      activeHand.status = HandStatus.STOOD; // 스플릿 후 BJ는 보통 21점으로 처리
    }
  }

  /**
   * 현재 게임 상태의 스냅샷을 반환합니다.
   * @returns {GameState} 현재 게임 상태 객체.
   */
  public getState(): GameState {
    return {
      deckSize: this.deck.length,
      playerHands: JSON.parse(JSON.stringify(this.playerHands)), // Deep copy
      dealerHand:
        this.phase === GamePhase.PLAYER_TURN
          ? [this.dealerHand[0]] // 플레이어 턴에는 딜러의 첫 카드만 공개
          : [...this.dealerHand],
      activeHandIndex: this.activeHandIndex,
      phase: this.phase,
      dealerUpCardValue: BlackjackGame.getHandValue([this.dealerHand[0]]).value,
      availableActions: this.getAvailableActions(),
    };
  }

  /**
   * 현재 활성화된 핸드에서 가능한 모든 액션을 반환합니다.
   * UI 버튼 활성화/비활성화 제어에 사용됩니다.
   */
  public getAvailableActions(): PlayerAction[] {
    if (this.phase !== GamePhase.PLAYER_TURN) return [];

    const actions: PlayerAction[] = [PlayerAction.HIT, PlayerAction.STAND];
    const activeHand = this.getActiveHand();
    const isFirstTurn = activeHand.cards.length === 2;

    // 더블다운
    if (isFirstTurn) {
      // 보통 첫 턴에만 가능
      actions.push(PlayerAction.DOUBLE_DOWN);
    }

    // 스플릿
    if (isFirstTurn && this.canSplit(activeHand)) {
      actions.push(PlayerAction.SPLIT);
    }

    // 보험 (여기서는 미구현, 필요시 추가)
    // if (isFirstTurn && this.dealerHand[0].rank === 1) {
    //     actions.push(PlayerAction.INSURANCE);
    // }

    return actions;
  }

  //-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
  // Private Helper Methods (내부 헬퍼 메서드)
  //-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

  private getActiveHand(): HandState {
    return this.playerHands[this.activeHandIndex];
  }

  private canPerformAction(action: PlayerAction): boolean {
    return this.getAvailableActions().includes(action);
  }

  private canSplit(hand: HandState): boolean {
    if (hand.cards.length !== 2) return false;
    const [card1, card2] = hand.cards;
    const value1 = card1.rank > 9 ? 10 : card1.rank;
    const value2 = card2.rank > 9 ? 10 : card2.rank;
    return value1 === value2;
  }

  /** 다음 플레이어 핸드로 이동하거나, 모든 핸드가 종료되면 딜러 턴으로 넘어갑니다. */
  private moveToNextHandOrResolve(): void {
    const nextActiveHandIndex = this.playerHands.findIndex(
      (hand, index) =>
        index > this.activeHandIndex && hand.status === HandStatus.ACTIVE
    );

    if (nextActiveHandIndex !== -1) {
      this.activeHandIndex = nextActiveHandIndex;
    } else {
      this.resolveDealerTurn();
    }
  }

  private resolveDealerTurn(): void {
    this.phase = GamePhase.DEALER_TURN;
    let dealerValue = BlackjackGame.getHandValue(this.dealerHand);

    while (
      dealerValue.value < 17 ||
      (dealerValue.value === 17 &&
        dealerValue.isSoft &&
        this.options.dealerHitsOnSoft17)
    ) {
      this.dealerHand.push(this.dealCard());
      dealerValue = BlackjackGame.getHandValue(this.dealerHand);
    }

    this.evaluateResults();
  }

  private evaluateResults(): void {
    const dealerValue = BlackjackGame.getHandValue(this.dealerHand).value;
    const dealerHasBlackjack =
      dealerValue === 21 && this.dealerHand.length === 2;

    for (const hand of this.playerHands) {
      // 이미 버스트되었거나, 플레이어가 블랙잭인 경우는 결과가 정해져 있음
      if (hand.status === HandStatus.BUST) {
        hand.result = HandResult.DEALER_WINS;
        continue;
      }
      if (hand.status === HandStatus.BLACKJACK) {
        hand.result = dealerHasBlackjack
          ? HandResult.PUSH
          : HandResult.PLAYER_WINS;
        // 블랙잭 배당은 외부에서 계산 (e.g., bet * blackjackPayout)
        continue;
      }

      const playerValue = BlackjackGame.getHandValue(hand.cards).value;

      if (dealerValue > 21 || playerValue > dealerValue) {
        hand.result = HandResult.PLAYER_WINS;
      } else if (playerValue < dealerValue) {
        hand.result = HandResult.DEALER_WINS;
      } else {
        hand.result = HandResult.PUSH;
      }
    }
    this.phase = GamePhase.ROUND_OVER;
  }

  private createNewDeck(): Card[] {
    const ranks = Array.from({ length: 13 }, (_, i) => i + 1);
    const suits = [0, 1, 2, 3];
    let deck: Card[] = [];
    for (let i = 0; i < this.options.numberOfDecks; i++) {
      for (const suit of suits) {
        for (const rank of ranks) {
          deck.push({ rank, suit });
        }
      }
    }
    return this.shuffle(deck);
  }

  private shuffle<T>(array: T[]): T[] {
    let currentIndex = array.length;
    while (currentIndex !== 0) {
      const randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex],
        array[currentIndex],
      ];
    }
    return array;
  }

  private dealCard(): Card {
    if (this.deck.length === 0) throw new Error("Deck is empty.");
    return this.deck.pop()!;
  }

  //-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
  // Public Static Helper Functions (공개 정적 헬퍼 함수)
  //-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

  /**
   * 핸드의 점수를 계산합니다. Ace(1)는 1 또는 11로 자동 계산됩니다.
   * @param hand 점수를 계산할 카드 배열
   * @returns {HandValue} 핸드의 점수와 Ace가 11로 계산되었는지 여부를 포함한 객체
   */
  public static getHandValue(hand: Card[]): HandValue {
    if (!hand || hand.length === 0) return { value: 0, isSoft: false };

    let sum = 0;
    let aceCount = 0;

    for (const card of hand) {
      if (card.rank > 10) {
        sum += 10;
      } else if (card.rank === 1) {
        aceCount++;
        sum += 11;
      } else {
        sum += card.rank;
      }
    }

    while (sum > 21 && aceCount > 0) {
      sum -= 10;
      aceCount--;
    }

    // isSoft: 합계가 21 이하이면서, Ace 하나가 11로 계산되고 있는 경우
    const isSoft = aceCount > 0 && sum + 10 * aceCount <= 21;

    return { value: sum, isSoft };
  }
}
