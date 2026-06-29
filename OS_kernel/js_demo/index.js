/**
 * ------------------------------------------------------------
 * Copyright (C) 2024  Agentix Team
 *
 * This program is free software: you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation, either version 3 of
 * the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 * ------------------------------------------------------------
 */

/**
 * ============================================================
 * Agentix OS Kernel — index.js  [Node.js Edition]
 * Central entry point — exports all public modules
 * ============================================================
 * Usage:
 *   const AgentixOS = require('./OS_kernel/js_node');
 *   const { AgentixKernel, TensionEngine, ... } = AgentixOS;
 *
 * NOTE: IntentAnchoring (module 10) is a paid module.
 *       It is not included in this open-source distribution.
 *       See: https://agentix.dev/modules for licensing.
 * ============================================================
 */

'use strict';

import { Vector, Semantic, AgentixKernel } from './corekernel.js';
import { TensionEngine } from './tension_engine.js';
import { SpatialMapping } from './spatial_mapping.js';
import { TemporalDynamics } from './temporal_dynamics.js';
import { HierarchicalHolarchy } from './hierarchical_holarchy.js';
import { EvolutionCalibration } from './evolution_calibration.js';
import { CommunicationInterface } from './communication.js';
import { ComplianceHealing } from './compliance_healing.js';
import { MetabolismResource } from './metabolism_resource.js';
import { MemoryCondensation } from './memory_condensation.js';

export {
    // Core primitives
    Vector,
    Semantic,
    AgentixKernel,

    // Layer modules (open-source, GPLv3)
    TensionEngine,
    SpatialMapping,
    TemporalDynamics,
    HierarchicalHolarchy,
    EvolutionCalibration,
    CommunicationInterface,
    ComplianceHealing,
    MetabolismResource,
    MemoryCondensation,
};
