/**
 * Stellar Route Risk Assessor
 * 
 * Assesses security and reliability risks of Stellar bridge routes.
 * Provides a risk score and breakdown of risk factors.
 */

import { StellarRouteBlacklistService } from '../../../security/blacklist/stellar/stellar-route-blacklist.service';
import { BridgeRoute } from '../../../services/route-ranker';
import { StellarNetworkMetrics } from '../../../scoring/routes/stellar';

export interface RiskFactor {
  name: string;
  value: number; // 0-1, where 1 is highest risk
  weight: number;
  description?: string;
}

export interface StellarRouteRiskAssessment {
  routeId: string;
  riskScore: number; // 0-1, where 1 is highest risk
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
}

export interface StellarRouteRiskAssessorOptions {
  // Weights for different risk factors (must sum to 1.0)
  reliabilityWeight?: number;
  liquidityWeight?: number;
  centralizationWeight?: number;
  blacklistWeight?: number;
  // Thresholds for risk levels
  lowRiskThreshold?: number;
  mediumRiskThreshold?: number;
  highRiskThreshold?: number;
}

export class StellarRouteRiskAssessor {
  private blacklistService: StellarRouteBlacklistService;
  private defaultOptions: Required<StellarRouteRiskAssessorOptions>;

  constructor(
    blacklistService: StellarRouteBlacklistService,
    options: StellarRouteRiskAssessorOptions = {}
  ) {
    this.blacklistService = blacklistService;
    this.defaultOptions = {
      reliabilityWeight: options.reliabilityWeight ?? 0.35,
      liquidityWeight: options.liquidityWeight ?? 0.25,
      centralizationWeight: options.centralizationWeight ?? 0.2,
      blacklistWeight: options.blacklistWeight ?? 0.2,
      lowRiskThreshold: options.lowRiskThreshold ?? 0.3,
      mediumRiskThreshold: options.mediumRiskThreshold ?? 0.5,
      highRiskThreshold: options.highRiskThreshold ?? 0.7,
    };
    
    // Validate weights sum to approximately 1.0
    const totalWeight = 
      this.defaultOptions.reliabilityWeight +
      this.defaultOptions.liquidityWeight +
      this.defaultOptions.centralizationWeight +
      this.defaultOptions.blacklistWeight;
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new Error('Risk factor weights must sum to 1.0');
    }
  }

  /**
   * Assess the risk of a single route
   * @param route The route to assess
   * @param referenceRoutes Optional list of reference routes for normalization (e.g., all available routes)
   * @returns Risk assessment for the route
   */
  assessRouteRisk(
    route: BridgeRoute,
    referenceRoutes: BridgeRoute[] = []
  ): StellarRouteRiskAssessment {
    const factors: RiskFactor[] = [];

    // 1. Reliability Risk (based on success rate and failure rate)
    const reliabilityRisk = this.calculateReliabilityRisk(route);
    factors.push({
      name: 'reliability',
      value: reliabilityRisk,
      weight: this.defaultOptions.reliabilityWeight,
      description: 'Risk based on historical success rate and failure rate',
    });

    // 2. Liquidity Risk (based on available liquidity)
    const liquidityRisk = this.calculateLiquidityRisk(route, referenceRoutes);
    factors.push({
      name: 'liquidity',
      value: liquidityRisk,
      weight: this.defaultOptions.liquidityWeight,
      description: 'Risk based on available liquidity for the route',
    });

    // 3. Centralization Risk (based on number of competing routes)
    const centralizationRisk = this.calculateCentralizationRisk(route, referenceRoutes);
    factors.push({
      name: 'centralization',
      value: centralizationRisk,
      weight: this.defaultOptions.centralizationWeight,
      description: 'Risk based on lack of route alternatives (centralization)',
    });

    // 4. Blacklist Risk (based on security blacklist)
    const blacklistRisk = this.calculateBlacklistRisk(route);
    factors.push({
      name: 'blacklist',
      value: blacklistRisk,
      weight: this.defaultOptions.blacklistWeight,
      description: 'Risk based on security blacklist status',
    });

    // Calculate weighted risk score
    const riskScore = factors.reduce((sum, factor) => {
      return sum + (factor.value * factor.weight);
    }, 0);

    // Determine risk level
    const riskLevel = this.calculateRiskLevel(riskScore);

    return {
      routeId: route.id,
      riskScore: Number(riskScore.toFixed(4)), // Limit to 4 decimal places
      riskLevel,
      factors,
    };
  }

  /**
   * Calculate reliability risk (0-1)
   * Lower success rate and higher failure rate increase risk
   */
  private calculateReliabilityRisk(route: BridgeRoute): number {
    // Use success rate if available, otherwise default to 0.5 risk
    const successRate = route.successRate ?? 0.5;
    const reliabilityRisk = 1 - successRate; // Invert so lower success rate = higher risk

    // Also consider failure rate from network metrics if available
    const failureRate = route.networkMetrics?.failureRate;
    if (typeof failureRate === 'number' && !Number.isNaN(failureRate)) {
      // Blend success rate risk and failure rate risk
      // We'll weight them equally for now
      const failureRisk = failureRate; // failure rate is already 0-1
      return (reliabilityRisk + failureRisk) / 2;
    }

    return reliabilityRisk;
  }

  /**
   * Calculate liquidity risk (0-1)
   * Lower liquidity increases risk
   * If referenceRoutes are provided, we normalize against the pool
   * Otherwise, we use a threshold-based approach
   */
  private calculateLiquidityRisk(
    route: BridgeRoute,
    referenceRoutes: BridgeRoute[]
  ): number {
    const liquidity = route.networkMetrics?.liquidityUsd;
    
    // If no liquidity data, return moderate risk
    if (typeof liquidity !== 'number' || Number.isNaN(liquidity)) {
      return 0.5;
    }

    // If we have reference routes, normalize against the pool
    if (referenceRoutes.length > 0) {
      const liquidityPool = referenceRoutes
        .map(r => r.networkMetrics?.liquidityUsd)
        .filter((val): val is number => typeof val === 'number' && !Number.isNaN(val));
      
      if (liquidityPool.length > 0) {
        const minLiquidity = Math.min(...liquidityPool);
        const maxLiquidity = Math.max(...liquidityPool);
        
        if (minLiquidity === maxLiquidity) {
          // All routes have same liquidity
          return 0.5;
        }
        
        // Normalize liquidity to 0-1 range (higher liquidity = lower risk)
        const normalizedLiquidity = (liquidity - minLiquidity) / (maxLiquidity - minLiquidity);
        // Risk is inverse: higher liquidity = lower risk
        return 1 - normalizedLiquidity;
      }
    }

    // Fallback to threshold-based approach
    // Define thresholds: 
    // - High liquidity (> 1,000,000 USD) -> low risk
    // - Medium liquidity (100,000 - 1,000,000) -> medium risk
    // - Low liquidity (< 100,000) -> high risk
    // We'll map to 0-1 range
    if (liquidity >= 1000000) {
      return 0.1; // low risk
    } else if (liquidity >= 100000) {
      // Linear interpolation between 0.3 and 0.6
      return 0.6 - ((liquidity - 100000) / 900000) * 0.3;
    } else {
      // Linear interpolation between 0.6 and 0.9
      return 0.9 - (liquidity / 100000) * 0.3;
    }
  }

  /**
   * Calculate centralization risk (0-1)
   * Fewer competing routes increases risk (less decentralization)
   * If referenceRoutes are provided, we compute based on activeRouteCount relative to pool
   * Otherwise, we use the route's activeRouteCount directly with thresholds
   */
  private calculateCentralizationRisk(
    route: BridgeRoute,
    referenceRoutes: BridgeRoute[]
  ): number {
    const activeRouteCount = route.networkMetrics?.activeRouteCount;
    
    // If no active route count data, return moderate risk
    if (typeof activeRouteCount !== 'number' || Number.isNaN(activeRouteCount)) {
      return 0.5;
    }

    // If we have reference routes, we can compute relative centralization
    if (referenceRoutes.length > 0) {
      const activeRoutePool = referenceRoutes
        .map(r => r.networkMetrics?.activeRouteCount)
        .filter((val): val is number => typeof val === 'number' && !Number.isNaN(val));
      
      if (activeRoutePool.length > 0) {
        const minActive = Math.min(...activeRoutePool);
        const maxActive = Math.max(...activeRoutePool);
        
        if (minActive === maxActive) {
          // All routes have same active count
          return 0.5;
        }
        
        // Normalize active route count to 0-1 range (higher count = lower centralization risk)
        const normalizedActiveCount = (activeRouteCount - minActive) / (maxActive - minActive);
        // Risk is inverse: higher active count = lower centralization risk
        return 1 - normalizedActiveCount;
      }
    }

    // Fallback to threshold-based approach
    // Define thresholds for active route count:
    // - High count (> 10) -> low risk
    // - Medium count (3 - 10) -> medium risk
    // - Low count (< 3) -> high risk
    if (activeRouteCount >= 10) {
      return 0.1; // low risk
    } else if (activeRouteCount >= 3) {
      // Linear interpolation between 0.3 and 0.6
      return 0.6 - ((activeRouteCount - 3) / 7) * 0.3;
    } else {
      // Linear interpolation between 0.6 and 0.9
      return 0.9 - (activeRouteCount / 3) * 0.3;
    }
  }

  /**
   * Calculate blacklist risk (0 or 1)
   * 1 if blacklisted, 0 otherwise
   */
  private calculateBlacklistRisk(route: BridgeRoute): number {
    return this.blacklistService.isBlacklisted(route.id) ? 1 : 0;
  }

  /**
   * Calculate risk level based on risk score
   */
  private calculateRiskLevel(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore < this.defaultOptions.lowRiskThreshold) {
      return 'low';
    } else if (riskScore < this.defaultOptions.mediumRiskThreshold) {
      return 'medium';
    } else if (riskScore < this.defaultOptions.highRiskThreshold) {
      return 'high';
    } else {
      return 'critical';
    }
  }

  /**
   * Update the risk assessor options
   */
  updateOptions(options: Partial<StellarRouteRiskAssessorOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
    
    // Validate weights sum to approximately 1.0
    const totalWeight = 
      this.defaultOptions.reliabilityWeight +
      this.defaultOptions.liquidityWeight +
      this.defaultOptions.centralizationWeight +
      this.defaultOptions.blacklistWeight;
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      throw new Error('Risk factor weights must sum to 1.0');
    }
  }

  /**
   * Get current options
   */
  getOptions(): Required<StellarRouteRiskAssessorOptions> {
    return { ...this.defaultOptions };
  }
}

// Create a default instance with the default blacklist service
const defaultBlacklistService = new StellarRouteBlacklistService();
export const stellarRouteRiskAssessor = new StellarRouteRiskAssessor(defaultBlacklistService);