import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RemediationGame from '../RemediationGame';
import { useRemediationFlow, submitRemediationLog } from '../useRemediationFlow';
import { MOCK_CONFIGS } from '../mockConfigs';

describe('RemediationGame Component Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal dialog with accessible attributes and theme accent', () => {
    const config = MOCK_CONFIGS[0]; // Dinosaurs Order Steps
    render(<RemediationGame config={config} onComplete={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Learning Mini-Game');
  });

  it('supports tap-to-place alternative to drag in OrderStepsGame', () => {
    const config = {
      ...MOCK_CONFIGS[0],
      steps: [
        { id: 's1', label: 'First Step', iconKey: 'dino_egg' },
        { id: 's2', label: 'Second Step', iconKey: 'baby_dino' },
        { id: 's3', label: 'Third Step', iconKey: 'star' }
      ]
    };
    render(<RemediationGame config={config} onComplete={vi.fn()} />);

    // Tap first card
    const card1 = screen.getByLabelText(/Step card: First Step/i);
    fireEvent.click(card1);

    // Tap slot 1 (correct slot for first step)
    const slot1 = screen.getByLabelText(/Slot 1, empty/i);
    fireEvent.click(slot1);

    // Slot 1 should now contain First Step
    expect(screen.getByLabelText(/Slot 1: contains First Step/i)).toBeInTheDocument();
  });

  it('triggers auto-assist after 2 misplacements in OrderStepsGame', () => {
    const config = {
      ...MOCK_CONFIGS[0],
      steps: [
        { id: 's1', label: 'First Step', iconKey: 'dino_egg' },
        { id: 's2', label: 'Second Step', iconKey: 'baby_dino' },
        { id: 's3', label: 'Third Step', iconKey: 'star' }
      ]
    };
    render(<RemediationGame config={config} onComplete={vi.fn()} />);

    // 1st misplacement: tap Second Step (belongs in slot 2) into Slot 1
    const card2 = screen.getByLabelText(/Step card: Second Step/i);
    fireEvent.click(card2);
    const slot1 = screen.getByLabelText(/Slot 1, empty/i);
    fireEvent.click(slot1);

    // 2nd misplacement: tap Third Step into Slot 1
    const card3 = screen.getByLabelText(/Step card: Third Step/i);
    fireEvent.click(card3);
    fireEvent.click(slot1);

    // After 2 misplacements, auto-assist automatically fills Slot 1 with First Step!
    expect(screen.getByLabelText(/Slot 1: contains First Step/i)).toBeInTheDocument();
    expect(screen.getByText(/guide this step right here/i)).toBeInTheDocument();
  });

  it('honors reduceMotion flag by disabling bouncing/shaking animation classes', () => {
    const config = MOCK_CONFIGS[0];
    const { container } = render(
      <RemediationGame config={config} onComplete={vi.fn()} reduceMotion={true} />
    );

    // Should not have any animate-bounce or animate-pulse on cards
    const bouncingElements = container.querySelectorAll('.animate-bounce');
    expect(bouncingElements.length).toBe(0);
  });

  it('renders Match the Numbers face-up pairs and allows tapping matches', () => {
    const config = MOCK_CONFIGS[3]; // Safari Paw Prints Match Pairs
    render(<RemediationGame config={config} onComplete={vi.fn()} />);

    // Numerals and Groups should both be visible face-up
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    // Tap number 2
    const num2 = screen.getByLabelText(/^Number 2/i);
    fireEvent.click(num2);

    // Tap matching group of 2 paws
    const group2 = screen.getByLabelText(/Group of 2 Paw Prints/i);
    fireEvent.click(group2);

    // Both should now show matched indicator
    expect(screen.getByLabelText(/Number 2, matched/i)).toBeInTheDocument();
  });
});

describe('useRemediationFlow and Telemetry', () => {
  it('submits remediation log silently without throwing', async () => {
    const globalFetch = vi.fn().mockRejectedValue(new Error('Network offline'));
    global.fetch = globalFetch;

    await expect(
      submitRemediationLog({
        gameType: 'order_steps',
        assisted: true,
        interactions: 4,
        misplacements: 2,
        durationMs: 14500
      })
    ).resolves.not.toThrow();

    expect(globalFetch).toHaveBeenCalledWith(
      '/api/remediation/log',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
