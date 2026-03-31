import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Scale a Kubernetes deployment using kubectl
 */
export async function scaleDeployment(deploymentName, replicas, namespace = 'default') {
  try {
    console.log(`🔧 Scaling ${deploymentName} to ${replicas} replicas using kubectl`);
    
    const command = `kubectl scale deployment ${deploymentName} --replicas=${replicas} -n ${namespace}`;
    
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && !stderr.includes('scaled')) {
      console.error('kubectl stderr:', stderr);
    }
    
    console.log(`✅ Scaled ${deploymentName} to ${replicas} replicas`);
    console.log('kubectl output:', stdout.trim());
    
    return {
      success: true,
      deploymentName,
      replicas,
      timestamp: new Date().toISOString(),
      output: stdout.trim()
    };
  } catch (error) {
    console.error(`❌ Failed to scale ${deploymentName}:`, error.message);
    throw error;
  }
}

/**
 * Get current deployment replicas using kubectl
 */
export async function getCurrentReplicas(deploymentName, namespace = 'default') {
  try {
    console.log(`📊 Getting replicas for ${deploymentName} using kubectl`);
    
    const command = `kubectl get deployment ${deploymentName} -n ${namespace} -o jsonpath='{.spec.replicas},{.status.replicas},{.status.readyReplicas}'`;
    
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      // Check if deployment doesn't exist
      if (stderr.includes('NotFound') || stderr.includes('not found')) {
        console.error(`⚠️ Deployment ${deploymentName} not found`);
        return null;
      }
      console.error('kubectl stderr:', stderr);
    }
    
    // Parse output: "desired,current,ready"
    const [desired, current, ready] = stdout.trim().split(',').map(n => parseInt(n) || 0);
    
    const result = {
      desired,
      current,
      ready
    };
    
    console.log(`✅ Got replicas for ${deploymentName}:`, result);
    
    return result;
  } catch (error) {
    // Check if it's a "not found" error
    if (error.message.includes('NotFound') || error.message.includes('not found')) {
      console.error(`⚠️ Deployment ${deploymentName} not found in namespace ${namespace}`);
      return null;
    }
    
    console.error(`Failed to get replicas for ${deploymentName}:`, error.message);
    throw error;
  }
}