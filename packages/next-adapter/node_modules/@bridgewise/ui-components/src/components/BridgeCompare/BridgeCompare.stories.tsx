import type { Meta, StoryObj } from '@storybook/react';

const meta: Meta = {
  title: 'Components/BridgeCompare',
  component: () => 'BridgeCompare Component',
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Sample routes data
const sampleRoutes = [
  {
    id: 'hop-eth-to-polygon',
    name: 'Hop Protocol',
    provider: 'hop',
    fee: 2.5,
    estimatedTime: 120,
    liquidity: 1000000,
    reliability: 0.95,
    slippage: 0.1,
  },
  {
    id: 'layerzero-eth-to-polygon',
    name: 'LayerZero',
    provider: 'layerzero',
    fee: 3.0,
    estimatedTime: 180,
    liquidity: 800000,
    reliability: 0.92,
    slippage: 0.15,
  },
];

export const Default: Story = {
  args: {
    routes: sampleRoutes,
    token: 'USDC',
    sourceChain: 'ethereum',
    destinationChain: 'polygon',
    showBenchmarkComparison: true,
    minLiquidityThreshold: 100000,
  },
};

export const EthToArbitrum: Story = {
  args: {
    routes: sampleRoutes.map(route => ({
      ...route,
      id: `${route.provider}-eth-to-arbitrum`,
      fee: route.fee * 1.2,
      estimatedTime: route.estimatedTime * 1.1,
    })),
    token: 'ETH',
    sourceChain: 'ethereum',
    destinationChain: 'arbitrum',
    showBenchmarkComparison: true,
    minLiquidityThreshold: 50000,
  },
};

export const WithoutBenchmark: Story = {
  args: {
    routes: sampleRoutes,
    token: 'USDT',
    sourceChain: 'polygon',
    destinationChain: 'optimism',
    showBenchmarkComparison: false,
    minLiquidityThreshold: 200000,
  },
};

export const HighLiquidityThreshold: Story = {
  args: {
    routes: sampleRoutes,
    token: 'ARB',
    sourceChain: 'base',
    destinationChain: 'ethereum',
    showBenchmarkComparison: true,
    minLiquidityThreshold: 900000,
  },
};

export const SingleRoute: Story = {
  args: {
    routes: [sampleRoutes[0]],
    token: 'OP',
    sourceChain: 'optimism',
    destinationChain: 'base',
    showBenchmarkComparison: true,
    minLiquidityThreshold: 0,
  },
};
