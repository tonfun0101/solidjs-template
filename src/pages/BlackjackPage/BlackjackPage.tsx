import { For, Show, type Component, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { Page } from "@/components/Page/Page.js";

// 1. 이전에 작성한 블랙잭 엔진과 타입을 가져옵니다.
import {
  BlackjackGame,
  GamePhase,
  PlayerAction,
  type GameState,
  type Card,
} from "@/Blackjack/Blackjack.js";

import "./BlackjackPage.css";

// 게임 엔진 인스턴스 생성 (커스텀 규칙 적용 가능)
const game = new BlackjackGame({ numberOfDecks: 4, dealerHitsOnSoft17: true });

export const BlackjackPage: Component = () => {
  // 2. createStore를 사용해 게임 전체 상태를 반응형으로 만듭니다.
  const [state, setState] = createStore<GameState>(game.getState());
  const [betAmount, setBetAmount] = createSignal(10); // 베팅 금액 상태

  // 3. 게임 액션을 처리하는 핸들러 함수들
  const handleDeal = () => {
    game.startRound(betAmount());
    setState(game.getState());
  };

  const handleHit = () => {
    game.hit();
    setState(game.getState());
  };

  const handleStand = () => {
    game.stand();
    setState(game.getState());
  };

  const handleDouble = () => {
    game.doubleDown();
    setState(game.getState());
  };

  const handleReset = () => {
    game.resetGame();
    setState(game.getState());
  };

  // 카드 컴포넌트 (UI 가독성을 위해 분리)
  const CardView: Component<{ card: Card }> = (props) => (
    <div class="card">
      {/* 실제 카드 이미지를 표시하거나, 텍스트로 간단히 표현할 수 있습니다. */}
      {props.card.rank}
      {props.card.suit}
    </div>
  );

  return (
    <Page title="Blackjack" back={false}>
      <div class="blackjack-table">
        {/* 딜러 영역 */}
        <div class="hand-area dealer-hand">
          <h3>
            Dealer's Hand (
            {state.dealerHand.length > 1 ? "??" : state.dealerUpCardValue})
          </h3>
          <div class="cards">
            <For each={state.dealerHand}>
              {(card) => <CardView card={card} />}
            </For>
          </div>
        </div>

        {/* 플레이어 영역 */}
        <div class="hand-area player-hand">
          <h3>Player's Hand</h3>
          <For each={state.playerHands}>
            {(hand, index) => (
              <div
                class={`hand ${
                  index() === state.activeHandIndex ? "active" : ""
                }`}
              >
                <div class="cards">
                  <For each={hand.cards}>
                    {(card) => <CardView card={card} />}
                  </For>
                </div>
              </div>
            )}
          </For>
        </div>

        {/* 게임 컨트롤 영역 */}
        <div class="controls">
          <Show
            when={
              state.phase === GamePhase.BETTING ||
              state.phase === GamePhase.ROUND_OVER
            }
          >
            <div class="betting-controls">
              <input
                type="number"
                value={betAmount()}
                onChange={(e) => setBetAmount(parseInt(e.currentTarget.value))}
              />
              <button onClick={handleDeal}>Bet</button>
            </div>
          </Show>

          <Show when={state.phase === GamePhase.PLAYER_TURN}>
            <div class="action-controls">
              <Show when={state.availableActions.includes(PlayerAction.HIT)}>
                <button onClick={handleHit}>Hit</button>
              </Show>
              <Show when={state.availableActions.includes(PlayerAction.STAND)}>
                <button onClick={handleStand}>Stand</button>
              </Show>
              <Show
                when={state.availableActions.includes(PlayerAction.DOUBLE_DOWN)}
              >
                <button onClick={handleDouble}>Double</button>
              </Show>
              {/* 스플릿 버튼도 동일한 방식으로 추가 가능 */}
            </div>
          </Show>

          <Show when={state.phase === GamePhase.ROUND_OVER}>
            <button onClick={handleReset}>Play Again</button>
          </Show>
        </div>
      </div>
    </Page>
  );
};
