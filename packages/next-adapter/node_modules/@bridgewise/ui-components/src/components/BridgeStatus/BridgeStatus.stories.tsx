import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
  title: 'Components/BridgeStatus',
  component: () => 'BridgeStatus Component',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    txHash: '0x1234567890abcdef1234567890abcdef12345678',
    bridgeName: 'hop',
    sourceChain: 'ethereum',
    destinationChain: 'polygon',
    amount: 100,
    token: 'USDC',
  },
};
