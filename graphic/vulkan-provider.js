import nvk from 'nvk';
import { GLSL } from 'nvk-essentials';
import fs from "fs";
import { mat4, quat, vec3 } from 'gl-matrix';
import { PNG } from 'pngjs';

Object.assign(global, nvk);

const validationLayers = [ 'VK_LAYER_RENDERDOC_Capture','VK_LAYER_LUNARG_standard_validation' ];
const deviceExtensions = [ 'VK_KHR_swapchain' ];
const maxFramesInFlaight = 2;

export default function vulkanProvider() {
    let window = new VulkanWindow({
        width: 480,
        height: 320,
        title: "example"
    });

    let instance = new VkInstance();
    let debugMessenger = new VkDebugUtilsMessengerEXT();
    let surface = new VkSurfaceKHR();
    let physicalDevice = new VkPhysicalDevice();
    let device = new VkDevice();
    let graphicsQueue = new VkQueue();
    let presentQueue = new VkQueue();
    let swapchain = new VkSwapchainKHR();
    let swapchainImages = [];
    let swapchainImageFormat = null;
    let swapchainExtent = new VkExtent2D();
    let imageViews = [];
    let renderPass = new VkRenderPass();
    let pipelineLayout = new VkPipelineLayout();
    let uniformDescriptorSetLayout = new VkDescriptorSetLayout();
    let texturesDescriptorSetLayout = new VkDescriptorSetLayout();
    let assetsDescriptorSetLayout = new VkDescriptorSetLayout();
    let graphicsPipeline = new VkPipeline();
    let swapchainFramebuffers = [];
    let commandPool = new VkCommandPool();
    let commandBuffers = [];
    let imageAvailableSemaphores = [];
    let renderFinishedSemaphores = [];
    let inFlightFences = [];
    let imagesInFlight = [];
    let currentFrame = 0;
    let frameBufferResized = false;
    let uniformBuffers = [];
    let buffers = [];
    let textures = [];
    let assets = [];
    let projectionMatrix = mat4.create();
    let viewMatrix = mat4.create();
    let uniformDescriptorPool = new VkDescriptorPool();
    let uniformDescriptorSets = [];
    let textureSampler = new VkSampler();
    let texturesDescriptorPool = new VkDescriptorPool();
    let assetsDescriptorPool = new VkDescriptorPool();
    let modelBuffer = 0;
    let modelDescriptorSet = new VkDescriptorSet();
    let depthImage = new VkImage();
    let depthImageMemory = new VkDeviceMemory();
    let depthImageView = new VkImageView();
    
    const createInstance = () => {
        const appCreateInfo = new VkApplicationInfo({
            pApplicationName: 'example',
            applicationVersion: VK_MAKE_VERSION(1, 0, 0),
            pEngineName: 'No Engine',
            engineVersion: VK_MAKE_VERSION(1, 0, 0),
            apiVersion: VK_API_VERSION_1_0
        });
        
        let availableValidationLayers = [];
        if (global.debug && !checkValidationLayers(validationLayers, availableValidationLayers)) {
            console.warn('Validation layers requested, but not available!');
        }
        
        const instanceExtensions = window.getRequiredInstanceExtensions();
        if (global.debug) {
            instanceExtensions.push(VK_EXT_DEBUG_UTILS_EXTENSION_NAME);
        }
    
        if (!checkInstanceExtensions(instanceExtensions)) {
            console.warn('Instance extensions requested, but not available!');
        }
    
        const instanceInfo = new VkInstanceCreateInfo({
            pApplicationInfo: appCreateInfo,
            enabledLayerCount: availableValidationLayers.length,
            ppEnabledLayerNames: availableValidationLayers,
            enabledExtensionCount: instanceExtensions.length,
            ppEnabledExtensionNames: instanceExtensions
        });

        const result = vkCreateInstance(instanceInfo, null, instance);
        if (result !== VkResult.VK_SUCCESS) {
            throw 'Failed to create VkInstance!';
        }
    }

    const setupDebugMessenger = () => {
        if (!global.debug) return;
    
        const debugMessengerCreateInfo = new VkDebugUtilsMessengerCreateInfoEXT({
            messageSeverity: VK_DEBUG_UTILS_MESSAGE_SEVERITY_VERBOSE_BIT_EXT | VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT | VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT | VK_DEBUG_UTILS_MESSAGE_SEVERITY_INFO_BIT_EXT,
            messageType: VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT | VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT | VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT,
            pfnUserCallback: debugMessageCallback
        });
    
        if (vkCreateDebugUtilsMessengerEXT(instance, debugMessengerCreateInfo, null, debugMessenger) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create debug messenger!';
        }
    }

    const createSurface = () => {
        if (window.createSurface(instance, null, surface) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create window surface!';
        }
    }

    const createPhysicalDevice = () => {
        let devicesCount = { $: 0 };
        vkEnumeratePhysicalDevices(instance, devicesCount, null);
    
        if (devicesCount.$ == 0) {
            throw 'Failed to find GPUs with Vulkan support!';
        }
    
        let physicalDevices = new Array(devicesCount.$).fill(null).map(x => new VkPhysicalDevice());
        vkEnumeratePhysicalDevices(instance, devicesCount, physicalDevices);
    
        let foundPhysicalDevice = null;
        physicalDevices.some(x => {
            if (isPhysicalDeviceSuitable(x) && findQueueFamilies(x, surface, null) && querySurfaceSupport(x, surface, null)) {
                foundPhysicalDevice = x;

                return true;
            }
    
            return false;
        });
    
        if (foundPhysicalDevice === null) {
            throw 'Failed to find a suitable GPU!';
        }
    
        physicalDevice = foundPhysicalDevice;
    }

    const createDevice = () => {
        let familyIndeces = { graphicsFamily: null, presentFamily: null };
        findQueueFamilies(physicalDevice, surface, familyIndeces);

        const graphicsQueueCreateInfo = new VkDeviceQueueCreateInfo({
            queueFamilyIndex: familyIndeces.graphicsFamily,
            queueCount: 1,
            pQueuePriorities: new Float32Array(1.0)
        });

        const presentQueueCreateInfo = new VkDeviceQueueCreateInfo({
            queueFamilyIndex: familyIndeces.presentFamily,
            queueCount: 1,
            pQueuePriorities: new Float32Array(1.0)
        })
    
        const deviceFeatures = new VkPhysicalDeviceFeatures({
            
        });
    
        const deviceCreateInfo = new VkDeviceCreateInfo({
            queueCreateInfoCount: 2,
            pQueueCreateInfos: [ graphicsQueueCreateInfo, presentQueueCreateInfo ],
            pEnabledFeatures: deviceFeatures,
            enabledExtensionCount: deviceExtensions.length,
            ppEnabledExtensionNames: deviceExtensions
        });
    
        if (global.debug) {
            deviceCreateInfo.enabledLayerCount = validationLayers.length;
            deviceCreateInfo.ppEnabledLayerNames = validationLayers;
        }
        else {
            deviceCreateInfo.enabledLayerCount = 0;
        }

        if (vkCreateDevice(physicalDevice, deviceCreateInfo, null, device) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create logical device!';
        }

        vkGetDeviceQueue(device, familyIndeces.graphicsFamily, 0, graphicsQueue);
        vkGetDeviceQueue(device, familyIndeces.presentFamily, 0, presentQueue);
    }

    const createSwapchain = (oldSwapchain = null) => {
        let swapchainSupportDetails = { capabilities: null, formats: null, presentModes: null };
        querySurfaceSupport(physicalDevice, surface, swapchainSupportDetails);

        const surfaceFormat = chooseSwapchainSurfaceFormat(swapchainSupportDetails.formats);
        const presentMode = chooseSwapchainPresentMode(swapchainSupportDetails.presentModes);
        const extent = chooseSwapchainExtent(swapchainSupportDetails.capabilities, window);

        const imageCount = swapchainSupportDetails.capabilities.minImageCount + 1;
        if (swapchainSupportDetails.capabilities.maxImageCount > 0 && imageCount > swapchainSupportDetails.capabilities.maxImageCount) {
            imageCount = swapchainSupportDetails.capabilities.maxImageCount;
        }

        const swapchainCreateInfo = new VkSwapchainCreateInfoKHR({
            surface: surface,
            minImageCount: imageCount,
            imageFormat: surfaceFormat.format,
            imageColorSpace: surfaceFormat.colorSpace,
            imageExtent: extent,
            imageArrayLayers: 1,
            imageUsage: VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT,
            preTransform: swapchainSupportDetails.capabilities.currentTransform,
            compositeAlpha: VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR,
            presentMode: presentMode,
            clipped: true,
            oldSwapchain: oldSwapchain 
        });

        let familyIndeces = { graphicsFamily: null, presentFamily: null };
        findQueueFamilies(physicalDevice, surface, familyIndeces);

        if (familyIndeces.graphicsFamily != familyIndeces.presentFamily) {
            swapchainCreateInfo.imageSharingMode = VK_SHARING_MODE_CONCURRENT;
            swapchainCreateInfo.queueFamilyIndexCount = 2;
            swapchainCreateInfo.pQueueFamilyIndices = [ familyIndeces.graphicsFamily, familyIndeces.presentFamily ];
        }
        else {
            swapchainCreateInfo.imageSharingMode = VK_SHARING_MODE_EXCLUSIVE;
            swapchainCreateInfo.queueFamilyIndexCount = 0;
            swapchainCreateInfo.pQueueFamilyIndices = null;
        }

        if (vkCreateSwapchainKHR(device, swapchainCreateInfo, null, swapchain) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create swap chain!';
        }

        const swapchainImageCount = { $: 0 };
        vkGetSwapchainImagesKHR(device, swapchain, swapchainImageCount, null);
        swapchainImages = new Array(swapchainImageCount.$).fill(null).map(x => new VkImage());
        vkGetSwapchainImagesKHR(device, swapchain, swapchainImageCount, swapchainImages);

        swapchainImageFormat = surfaceFormat.format;
        swapchainExtent = extent;
    }

    const createImageViews = () => {
        imageViews = new Array(swapchainImages.length).fill(null).map(x => new VkImageView());

        swapchainImages.forEach((x, i) => {
            imageViews[i] = createImageView(x, swapchainImageFormat);
        });
    }

    const createGraphicsPipeline = () => {
        const vertCode = readShader('glsl/simple.vert', 'vert');
        const fragCode = readShader('glsl/simple.frag', 'frag');

        const vertShader = createShaderModule(vertCode);
        const fragShader = createShaderModule(fragCode);

        const shaderStages = [
            new VkPipelineShaderStageCreateInfo({
                stage: VK_SHADER_STAGE_VERTEX_BIT,
                module: vertShader,
                pName: 'main'
            }),
            new VkPipelineShaderStageCreateInfo({
                stage: VK_SHADER_STAGE_FRAGMENT_BIT,
                module: fragShader,
                pName: 'main'
            })
        ];

        const uniformDescriptorSetLayoutBindings = new VkDescriptorSetLayoutBinding({
            binding: 0,
            descriptorType: VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER,
            descriptorCount: 1,
            stageFlags: VK_SHADER_STAGE_VERTEX_BIT
        });
    
        const uniformDescriptorSetLayoutCreateInfo = new VkDescriptorSetLayoutCreateInfo({
            bindingCount: 1,
            pBindings: [ uniformDescriptorSetLayoutBindings ]
        });

        if (vkCreateDescriptorSetLayout(device, uniformDescriptorSetLayoutCreateInfo, null, uniformDescriptorSetLayout) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create uniform descriptor set layout!';
        }

        const texturesDescriptorSetLayoutBindings = [
            new VkDescriptorSetLayoutBinding({
                binding: 1,
                descriptorType: VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
                descriptorCount: 1,
                stageFlags: VK_SHADER_STAGE_FRAGMENT_BIT,
                pImmutableSamplers: null
            })
        ];

        const texturesDescriptorSetLayoutCreateInfo = new VkDescriptorSetLayoutCreateInfo({
            bindingCount: texturesDescriptorSetLayoutBindings.length,
            pBindings: texturesDescriptorSetLayoutBindings
        });

        if (vkCreateDescriptorSetLayout(device, texturesDescriptorSetLayoutCreateInfo, null, texturesDescriptorSetLayout) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create textures descriptor set layout!';
        }

        const assetsDescriptorSetLayoutBindings = [
            new VkDescriptorSetLayoutBinding({
                binding: 2,
                descriptorType: VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC,
                descriptorCount: 1,
                stageFlags: VK_SHADER_STAGE_VERTEX_BIT
            })
        ];

        const assetsDescriptorSetLayoutCreateInfo = new VkDescriptorSetLayoutCreateInfo({
            bindingCount: assetsDescriptorSetLayoutBindings.length,
            pBindings: assetsDescriptorSetLayoutBindings
        });

        if (vkCreateDescriptorSetLayout(device, assetsDescriptorSetLayoutCreateInfo, null, assetsDescriptorSetLayout) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create assets descriptor set layout!';
        }

        const bindingDescriptions = [
            new VkVertexInputBindingDescription({
                binding: 0,
                stride: 5 * Float32Array.BYTES_PER_ELEMENT,
                inputRate: VK_VERTEX_INPUT_RATE_VERTEX
            })
        ];

        const attributeDescriptions = [
            new VkVertexInputAttributeDescription({
                binding: 0,
                location: 0,
                format: VK_FORMAT_R32G32_SFLOAT,
                offset: 0
            }),
            new VkVertexInputAttributeDescription({
                binding: 0,
                location: 1,
                format: VK_FORMAT_R32G32_SFLOAT,
                offset: 3 * Float32Array.BYTES_PER_ELEMENT
            })
        ];

        const vertexInputInfo = new VkPipelineVertexInputStateCreateInfo({
            vertexBindingDescriptionCount: bindingDescriptions.length,
            pVertexBindingDescriptions: bindingDescriptions,
            vertexAttributeDescriptionCount: attributeDescriptions.length,
            pVertexAttributeDescriptions: attributeDescriptions
        });

        const inputAssambly = new VkPipelineInputAssemblyStateCreateInfo({
            topology: VK_PRIMITIVE_TOPOLOGY_TRIANGLE_LIST,
            primitiveRestartEnable: false
        });

        const viewport = new VkViewport({
            x: 0.0,
            y: 0.0,
            width: swapchainExtent.width,
            height: swapchainExtent.height,
            minDepth: 0.0,
            maxDepth: 1.0
        });

        const scissor = new VkRect2D({
            offset: new VkOffset2D({
                x: 0,
                y: 0
            }),
            extent: swapchainExtent
        });
        
        const viewportState = new VkPipelineViewportStateCreateInfo({
            viewportCount: 1,
            pViewports: [viewport],
            scissorCount: 1,
            pScissors: [scissor]
        });
        
        const rasterizer = new VkPipelineRasterizationStateCreateInfo({
            depthClampEnable: false,
            rasterizerDiscardEnable: false,
            polygonMode: VK_POLYGON_MODE_FILL,
            lineWidth: 1.0,
            cullMode: VK_CULL_MODE_FRONT_BIT,
            frontFace: VK_FRONT_FACE_COUNTER_CLOCKWISE,
            depthBiasEnable: false,
            depthBiasConstantFactor: 0,
            depthBiasClamp: 0,
            depthBiasSlopeFactor: 0
        });

        const multisampling = new VkPipelineMultisampleStateCreateInfo({
            sampleShadingEnable: false,
            rasterizationSamples: VK_SAMPLE_COUNT_1_BIT,
            minSampleShading: 1.0,
            pSampleMask: null,
            alphaToCoverageEnable: false,
            alphaToOneEnable: false
        });

        const colorBlendAttachment = new VkPipelineColorBlendAttachmentState({
            colorWriteMask: VK_COLOR_COMPONENT_R_BIT | VK_COLOR_COMPONENT_G_BIT | VK_COLOR_COMPONENT_B_BIT | VK_COLOR_COMPONENT_A_BIT,
            blendEnable: false,
            srcColorBlendFactor: VK_BLEND_FACTOR_ONE,
            dstColorBlendFactor: VK_BLEND_FACTOR_ZERO,
            colorBlendOp: VK_BLEND_OP_ADD,
            srcAlphaBlendFactor: VK_BLEND_FACTOR_ONE,
            dstAlphaBlendFactor: VK_BLEND_FACTOR_ZERO,
            alphaBlendOp: VK_BLEND_OP_ADD
        });

        const colorBlending = new VkPipelineColorBlendStateCreateInfo({
            logicOpEnable: false,
            logicOp: VK_LOGIC_OP_COPY,
            attachmentCount: 1,
            pAttachments: [colorBlendAttachment],
            blendConstants: [
                0.0,
                0.0,
                0.0,
                0.0
            ]
        });

        const dynamicStates = [
            VK_DYNAMIC_STATE_VIEWPORT,
            VK_DYNAMIC_STATE_LINE_WIDTH
        ];

        const pipelineLayoutInfo = new VkPipelineLayoutCreateInfo({
            setLayoutCount: 3,
            pSetLayouts: [ uniformDescriptorSetLayout, texturesDescriptorSetLayout, assetsDescriptorSetLayout ],
            pushConstantRangeCount: 0,
            pPushConstantRanges: null
        });

        if (vkCreatePipelineLayout(device, pipelineLayoutInfo, null, pipelineLayout) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create pipeline layout!';
        }

        const dynamicStateInfo = new VkPipelineDynamicStateCreateInfo({
            dynamicStateCount: 2,
            pDynamicStates: new Int32Array(dynamicStates)
        });

        const depthStencilInfo = new VkPipelineDepthStencilStateCreateInfo({
            depthTestEnable: true,
            depthWriteEnable: true,
            depthCompareOp: VK_COMPARE_OP_LESS,
            depthBoundsTestEnable: false,
            minDepthBounds: 0.0,
            maxDepthBounds: 1.0,
            stencilTestEnable: false
        });

        const graphicsPipelineInfo = new VkGraphicsPipelineCreateInfo({
            stageCount: shaderStages.length,
            pStages: shaderStages,
            pVertexInputState: vertexInputInfo,
            pInputAssemblyState: inputAssambly,
            pViewportState: viewportState,
            pRasterizationState: rasterizer,
            pMultisampleState: multisampling,
            pColorBlendState: colorBlending,
            layout: pipelineLayout,
            renderPass: renderPass,
            subpass: 0,
            basePipelineHandle: null,
            basePipelineIndex: -1,
            pDepthStencilState: depthStencilInfo
            //pDynamicState: dynamicStateInfo
        });

        if (vkCreateGraphicsPipelines(device, null, 1, [ graphicsPipelineInfo ], null, [ graphicsPipeline ]) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create graphics pipeline!';
        }
        
        vkDestroyShaderModule(device, vertShader, null);
        vkDestroyShaderModule(device, fragShader, null);
    }

    const createRenderPass = () => {
        const colorAttachment = new VkAttachmentDescription({
            format: swapchainImageFormat,
            samples: VK_SAMPLE_COUNT_1_BIT,
            loadOp: VK_ATTACHMENT_LOAD_OP_CLEAR,
            storeOp: VK_ATTACHMENT_STORE_OP_STORE,
            stencilLoadOp: VK_ATTACHMENT_LOAD_OP_DONT_CARE,
            stencilStoreOp: VK_ATTACHMENT_STORE_OP_DONT_CARE,
            initialLayout: VK_IMAGE_LAYOUT_UNDEFINED,
            finalLayout: VK_IMAGE_LAYOUT_PRESENT_SRC_KHR
        });

        const colorAttachmentRef = new VkAttachmentReference({
            attachment: 0,
            layout: VK_IMAGE_LAYOUT_COLOR_ATTACHMENT_OPTIMAL
        });

        const depthAttachment = new VkAttachmentDescription({
            format: findDepthFormat(),
            samples: VK_SAMPLE_COUNT_1_BIT,
            loadOp: VK_ATTACHMENT_LOAD_OP_CLEAR,
            storeOp: VK_ATTACHMENT_STORE_OP_DONT_CARE,
            stencilLoadOp: VK_ATTACHMENT_LOAD_OP_DONT_CARE,
            stencilStoreOp: VK_ATTACHMENT_STORE_OP_DONT_CARE,
            initialLayout: VK_IMAGE_LAYOUT_UNDEFINED,
            finalLayout: VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL
        });

        const depthAttachmentRef = new VkAttachmentReference({
            attachment: 1,
            layout: VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL
        });

        const subPass = new VkSubpassDescription({
            pipelineBindPoint: VK_PIPELINE_BIND_POINT_GRAPHICS,
            colorAttachmentCount: 1,
            pColorAttachments: [ colorAttachmentRef ],
            pDepthStencilAttachment: depthAttachmentRef
        });

        const subPassDependency = new VkSubpassDependency({
            srcSubpass: VK_SUBPASS_EXTERNAL,
            dstSubpass: 0,
            srcStageMask: VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT,
            srcAccessMask: 0,
            dstStageMask: VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT,
            dstAccessMask: VK_ACCESS_COLOR_ATTACHMENT_WRITE_BIT
        });

        const renderPassInfo = new VkRenderPassCreateInfo({
            attachmentCount: 2,
            pAttachments: [colorAttachment, depthAttachment],
            subpassCount: 1,
            pSubpasses: [subPass],
            dependencyCount: 1,
            pDependencies: [subPassDependency]
        });

        if (vkCreateRenderPass(device, renderPassInfo, null, renderPass) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create render pass!';
        }
    }

    const createFrameBuffers = () => {
        swapchainFramebuffers = new Array(imageViews.length).fill(null).map(() => new VkFramebuffer());

        imageViews.forEach((x, i) => {
            const frameBufferInfo = new VkFramebufferCreateInfo({
                renderPass: renderPass,
                attachmentCount: 2,
                pAttachments: [ x, depthImageView ],
                width: swapchainExtent.width,
                height: swapchainExtent.height,
                layers: 1
            });

            if (vkCreateFramebuffer(device, frameBufferInfo, null, swapchainFramebuffers[i]) !== VkResult.VK_SUCCESS) {
                throw 'Failed to create framebuffer!';
            }
        });
    }

    const createCommandPool = () => {
        let queueFamilies = { graphicsFamily: null, presentFamily: null };
        findQueueFamilies(physicalDevice, surface, queueFamilies);

        const commandPoolInfo = new VkCommandPoolCreateInfo({
            queueFamilyIndex: queueFamilies.graphicsFamily,
            flags: 0
        });

        if (vkCreateCommandPool(device, commandPoolInfo, null, commandPool) !== VkResult.VK_SUCCESS) {
            throw '!failed to create command pool!';
        }
    }

    const createCommandBuffers = () => {
        commandBuffers = new Array(swapchainFramebuffers.length).fill(null).map(() => new VkCommandBuffer());

        const commandBufferAllocateInfo = new VkCommandBufferAllocateInfo({
            commandPool: commandPool,
            level: VK_COMMAND_BUFFER_LEVEL_PRIMARY,
            commandBufferCount: commandBuffers.length
        });

        if (vkAllocateCommandBuffers(device, commandBufferAllocateInfo, commandBuffers) !== VkResult.VK_SUCCESS) {
            throw 'Failed to allocate command buffers!';
        }

        commandBuffers.forEach((x, i) => {
            const beginInfo = new VkCommandBufferBeginInfo({
                flags: 0,
                pInheritanceInfo: null
            });

            if (vkBeginCommandBuffer(x, beginInfo) !== VkResult.VK_SUCCESS) {
                throw 'Failed to begin recording command buffer!';
            }

            const clearColor = new VkClearValue();
            clearColor.color.float32 = [ 1.0, 1.0, 1.0, 1.0 ];

            const clearDepth = new VkClearValue();
            clearDepth.depthStencil = new VkClearDepthStencilValue({
                depth: 1.0,
                stencil: 0
            });

            const renderPassBeginInfo = new VkRenderPassBeginInfo({
                renderPass: renderPass,
                framebuffer: swapchainFramebuffers[i],
                clearValueCount: 2,
                pClearValues: [clearColor, clearDepth],
                renderArea: new VkRect2D({
                    offset: new VkOffset2D({
                        x: 0,
                        y: 0
                    }),
                    extent: swapchainExtent
                })
            });

            vkCmdBeginRenderPass(x, renderPassBeginInfo, VK_SUBPASS_CONTENTS_INLINE);

            vkCmdBindPipeline(x, VK_PIPELINE_BIND_POINT_GRAPHICS, graphicsPipeline);
            
            assets.forEach((y, j) => {
                vkCmdBindVertexBuffers(x, 0, 1, [ buffers[y.vertexBuffer].buffer ], new BigUint64Array([ 0n ]));
                vkCmdBindIndexBuffer(x, buffers[y.indexBuffer].buffer, 0, VK_INDEX_TYPE_UINT16);
                vkCmdBindDescriptorSets(x, VK_PIPELINE_BIND_POINT_GRAPHICS, pipelineLayout, 0, 2, 
                    [ uniformDescriptorSets[i], textures[y.texture].descriptorSet ], 
                0, null);

                vkCmdBindDescriptorSets(x, VK_PIPELINE_BIND_POINT_GRAPHICS, pipelineLayout, 2, 1, 
                    [ modelDescriptorSet ], 
                1, new Uint32Array([ y.byteOffset ]));

                vkCmdDrawIndexed(x, buffers[y.indexBuffer].size, 1, 0, 0, 0);
            });

            vkCmdEndRenderPass(x);

            if (vkEndCommandBuffer(x) !== VkResult.VK_SUCCESS) {
                throw 'Failed to record command buffer!';
            }
        });
    }

    const createSyncObjects = () => {
        imageAvailableSemaphores = new Array(maxFramesInFlaight).fill(null).map(() => new VkSemaphore());
        renderFinishedSemaphores = new Array(maxFramesInFlaight).fill(null).map(() => new VkSemaphore());
        inFlightFences = new Array(maxFramesInFlaight).fill(null).map(() => new VkFence());
        imagesInFlight = new Array(swapchainImages.length).fill(null);


        const semaphoreCreateInfo = new VkSemaphoreCreateInfo();
        const fenceCreateInfo = new VkFenceCreateInfo({
            flags: VK_FENCE_CREATE_SIGNALED_BIT
        });

        for (let i = 0; i < maxFramesInFlaight; i++) {
            if (vkCreateSemaphore(device, semaphoreCreateInfo, null, imageAvailableSemaphores[i]) !== VkResult.VK_SUCCESS ||
                vkCreateSemaphore(device, semaphoreCreateInfo, null, renderFinishedSemaphores[i]) !== VkResult.VK_SUCCESS ||
                vkCreateFence(device, fenceCreateInfo, null, inFlightFences[i]) !== VkResult.VK_SUCCESS) {
                throw 'Failed to create synchronization objects for a frame!';
            }
        }
    }

    const drawFrame = () => {
        if (window.frameBufferWidth == 0 || window.frameBufferHeight == 0) {
            return;
        }

        vkWaitForFences(device, 1, [ inFlightFences[currentFrame] ], true, Number.MAX_SAFE_INTEGER);

        let imageIndex = { $: 0 };
        let result = vkAcquireNextImageKHR(device, swapchain, Number.MAX_SAFE_INTEGER, imageAvailableSemaphores[currentFrame], null, imageIndex);
        
        if (result === VK_ERROR_OUT_OF_DATE_KHR) {
            recreateSwapchain();

            return;
        }
        
        if (result !== VkResult.VK_SUCCESS && result !== VK_SUBOPTIMAL_KHR) {
            throw 'Failed to acquire swap chain image!';
        }

        if (imagesInFlight[imageIndex.$] !== null) {
            vkWaitForFences(device, 1, [imagesInFlight[imageIndex.$]], true, Number.MAX_SAFE_INTEGER);
        }

        imagesInFlight[imageIndex.$] = inFlightFences[currentFrame];

        const submitInfo = new VkSubmitInfo({
            waitSemaphoreCount: 1,
            pWaitSemaphores: [ imageAvailableSemaphores[currentFrame] ],
            pWaitDstStageMask: new Int32Array([ VK_PIPELINE_STAGE_COLOR_ATTACHMENT_OUTPUT_BIT ]),
            commandBufferCount: 1,
            pCommandBuffers: [commandBuffers[imageIndex.$]],
            signalSemaphoreCount: 1,
            pSignalSemaphores: [ renderFinishedSemaphores[currentFrame] ]
        });

        vkResetFences(device, 1, [ inFlightFences[currentFrame] ]);

        if (vkQueueSubmit(graphicsQueue, 1, [ submitInfo ], inFlightFences[currentFrame]) !== VkResult.VK_SUCCESS) {
            throw 'Failed to submit draw command buffer!';
        }

        const presentInfo = new VkPresentInfoKHR({
            waitSemaphoreCount: 1,
            pWaitSemaphores: [ renderFinishedSemaphores[currentFrame] ],
            swapchainCount: 1,
            pSwapchains: [ swapchain ],
            pImageIndices: new Uint32Array([ imageIndex.$ ]),
            pResults: null
        });

        result = vkQueuePresentKHR(presentQueue, presentInfo);

        if (result === VK_ERROR_OUT_OF_DATE_KHR || result === VK_SUBOPTIMAL_KHR || frameBufferResized) {
            frameBufferResized = false;

            recreateSwapchain();
        }
        else if (result !== VkResult.VK_SUCCESS) {
            throw 'Failed to present swap chain image!'
        }

        currentFrame = (currentFrame + 1) % maxFramesInFlaight;
    }

    const recreateSwapchain = () => {
        vkDeviceWaitIdle(device);

        cleanupSwapchain();

        createSwapchain();
        createImageViews();
        createDepthResource();
        createRenderPass();
        createGraphicsPipeline();
        createFrameBuffers();
        createProjectionMatrix();
        createUniformBuffers();
        createUniformDescriptorPool();
        createUniformDescriptorSets();
        createCommandBuffers();
    }

    const cleanupSwapchain = () => {
        swapchainFramebuffers.forEach(x => vkDestroyFramebuffer(device, x, null));

        vkFreeCommandBuffers(device, commandPool, commandBuffers.length, commandBuffers);
        vkDestroyPipeline(device, graphicsPipeline, null);
        vkDestroyPipelineLayout(device, pipelineLayout, null);
        vkDestroyRenderPass(device, renderPass, null);

        imageViews.forEach(x => vkDestroyImageView(device, x, null));

        vkDestroyImageView(device, depthImageView, null);

        vkDestroySwapchainKHR(device, swapchain, null);

        uniformBuffers.forEach(x => {
            vkDestroyBuffer(device, buffers[x].buffer, null);
            vkFreeMemory(device, buffers[x].bufferMemory, null);
        });

        vkDestroyDescriptorPool(device, uniformDescriptorPool, null);
    }

    const createShaderModule = (shaderCode) => {
        const shaderModuleCreateInfo = new VkShaderModuleCreateInfo({
            codeSize: shaderCode.byteLength,
            pCode: shaderCode
        });
    
        let shaderModule = new VkShaderModule();
        if(vkCreateShaderModule(device, shaderModuleCreateInfo, null, shaderModule) != VkResult.VK_SUCCESS) {
            throw 'Failed to create shader module!';
        }

        return shaderModule;
    }

    const createUniformBuffer = (data, properties) => {
        const bufferSize = data.byteLength;
        const buffer = new VkBuffer();
        const bufferMemory = new VkDeviceMemory();

        createBuffer(bufferSize, VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT, properties, buffer, bufferMemory);
        copyData(bufferMemory, bufferSize, data, Float32Array);

        return buffers.push({ buffer, bufferMemory, size: data.length, bufferSize }) - 1;
    }

    const createUniformBuffers = () => {
        uniformBuffers = new Array(swapchainImages.length).fill(null);

        uniformBuffers = uniformBuffers.map(() => createUniformBuffer(new Float32Array([ ...projectionMatrix, ...viewMatrix ]), VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT));
    }

    const createVertexBuffer = (vertices) => {
        if (!(vertices instanceof Float32Array)) {
            throw 'Vertices must be instance of Float32Array!';
        }

        const bufferSize = vertices.byteLength;
        const stagingBuffer = new VkBuffer();
        const stagingBufferMemory = new VkDeviceMemory();
        createBuffer(bufferSize, VK_BUFFER_USAGE_TRANSFER_SRC_BIT, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT, stagingBuffer, stagingBufferMemory);
        copyData(stagingBufferMemory, bufferSize, vertices, Float32Array);

        const buffer = new VkBuffer();
        const bufferMemory = new VkDeviceMemory();
        createBuffer(bufferSize, VK_BUFFER_USAGE_TRANSFER_DST_BIT | VK_BUFFER_USAGE_VERTEX_BUFFER_BIT, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, buffer, bufferMemory);
        copyBuffer(stagingBuffer, buffer, bufferSize);

        vkDestroyBuffer(device, stagingBuffer, null);
        vkFreeMemory(device, stagingBufferMemory, null);

        const bufferIndex = buffers.push({ buffer: buffer, bufferMemory: bufferMemory, size: vertices.length, bufferSize }) - 1;

        return bufferIndex;
    }

    const createIndexBuffer = (indeces) => {
        if (!(indeces instanceof Uint16Array)) {
            throw 'indeces must be instance of Uint16Array!';
        }

        const bufferSize = indeces.byteLength;
        const stagingBuffer = new VkBuffer();
        const stagingBufferMemory = new VkDeviceMemory();
        createBuffer(bufferSize, VK_BUFFER_USAGE_TRANSFER_SRC_BIT, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT, stagingBuffer, stagingBufferMemory);
        copyData(stagingBufferMemory, bufferSize, indeces, Uint16Array);

        const buffer = new VkBuffer();
        const bufferMemory = new VkDeviceMemory();
        createBuffer(bufferSize, VK_BUFFER_USAGE_TRANSFER_DST_BIT | VK_BUFFER_USAGE_INDEX_BUFFER_BIT, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, buffer, bufferMemory);
        copyBuffer(stagingBuffer, buffer, bufferSize);

        vkDestroyBuffer(device, stagingBuffer, null);
        vkFreeMemory(device, stagingBufferMemory, null);

        const bufferIndex = buffers.push({ buffer: buffer, bufferMemory: bufferMemory, size: indeces.length, bufferSize }) - 1;

        return bufferIndex;
    }

    const createBuffer = (size, usage, properties, buffer, bufferMemory) => {
        const bufferInfo = new VkBufferCreateInfo({
            size: size,
            usage: usage,
            sharingMode: VK_SHARING_MODE_EXCLUSIVE
        });

        if (vkCreateBuffer(device, bufferInfo, null, buffer) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create vertex buffer!';
        }

        let memRequirements = new VkMemoryRequirements();
        vkGetBufferMemoryRequirements(device, buffer, memRequirements);
        
        const memAllocInfo = new VkMemoryAllocateInfo({
            allocationSize: memRequirements.size,
            memoryTypeIndex: findMemoryType(physicalDevice, memRequirements.memoryTypeBits, properties)
        });

        if (vkAllocateMemory(device, memAllocInfo, null, bufferMemory) !== VkResult.VK_SUCCESS) {
            throw 'Failed to allocate vertex buffer memory!';
        }

        vkBindBufferMemory(device, buffer, bufferMemory, 0);
    }

    const copyBuffer = (srcBuffer, dstBuffer, size) => {
        const commandBuffer = beginCommandBuffer();

        const copyRegion = new VkBufferCopy({
            srcOffset: 0,
            dstOffset: 0,
            size: size
        });
        
        vkCmdCopyBuffer(commandBuffer, srcBuffer, dstBuffer, 1, [copyRegion]);
        
        endCommandBuffer(commandBuffer);
    }

    const copyData = (dstMemo, size, data, viewProvider, offset = 0) => {
        const dataPtr = { $: 0n };
        vkMapMemory(device, dstMemo, 0, size, 0, dataPtr);

        let address = ArrayBuffer.fromAddress(dataPtr.$, size);
        let view = new viewProvider(address);
        for (let i = offset; i < offset + data.length; i++) {
            view[i] = data[i - offset];
        }

        vkUnmapMemory(device, dstMemo);
    }

    const createAsset = ({ indexBuffer, vertexBuffer, texture, position, rotation, scale }) => {
        const model = computeModelMatrix({ position, rotation, scale });
        const asset = { 
            indexBuffer, vertexBuffer, texture, position, rotation, scale, model, 
            byteOffset: assets.length * model.byteLength,
            offset: assets.length * model.length
        };

        assets.push(asset);

        return asset;
    }

    const updateAsset = (asset) => {
        asset.model = computeModelMatrix(asset);
        
        updateDynamicUniformBuffer(modelBuffer, asset.model, asset.offset);
    }

    const updateUniformBuffer = (bufferIndex, data) => {
        const bufferSize = data.byteLength;
        const bufferMemory = buffers[bufferIndex].bufferMemory;
        
        copyData(bufferMemory, bufferSize, data, Float32Array);
    }

    const updateDynamicUniformBuffer = (bufferIndex, data, offset) => {
        const { bufferSize, bufferMemory } = buffers[bufferIndex];

        copyData(bufferMemory, bufferSize, data, Float32Array, offset);
    }

    const createProjectionMatrix = () => {
        const aspect = swapchainExtent.width / swapchainExtent.height;
        const zNear = 0.1;
        const zFar = 4096.0;
        const fov = 45 * Math.PI / 180;

        mat4.perspective(projectionMatrix, fov, aspect, zNear, zFar);

        projectionMatrix[5] *= -1.0;
    }

    const createViewMatrix = ({ position = {x: 0, y: 0, z: 0}, target = {x: 0, y: 0, z: 0} }) => {
        mat4.lookAt(viewMatrix, [position.x, position.y, position.z], [target.x, target.y, target.z], [0, 1, 0]);
    }

    const computeModelMatrix = ({ position = {x: 0, y: 0, z: 0}, rotation = {x: 0, y: 0, z: 0}, scale = {x: 1, y: 1, z: 1} }) => {
        const modelViewMatrix = mat4.create();
        const translate = vec3.fromValues(position.x, position.y, position.z);
        const rotationQuat = quat.create();
        const rotationMatrix = mat4.create();

        mat4.translate(modelViewMatrix, modelViewMatrix, translate);
        quat.fromEuler(rotationQuat, rotation.x, rotation.y, rotation.z);
        mat4.fromQuat(rotationMatrix, rotationQuat);
        mat4.multiply(modelViewMatrix, modelViewMatrix, rotationMatrix);
        mat4.scale(modelViewMatrix, modelViewMatrix, [scale.x, scale.y, scale.z]);

        return modelViewMatrix;
    }

    const createUniformDescriptorPool = () => {
        const poolSizes = [
            new VkDescriptorPoolSize({
                type: VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER,
                descriptorCount: swapchainImages.length
            })
        ];

        const poolCreateInfo = new VkDescriptorPoolCreateInfo({
            poolSizeCount: poolSizes.length,
            pPoolSizes: poolSizes,
            maxSets: swapchainImages.length
        });

        if (vkCreateDescriptorPool(device, poolCreateInfo, null, uniformDescriptorPool) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create uniform descriptor pool!';
        }
    }

    const createUniformDescriptorSets = () => {
        uniformDescriptorSets = createDescriptorSets(uniformDescriptorSetLayout, uniformDescriptorPool, swapchainImages.length);

        uniformDescriptorSets.forEach((x, i) => {
            const bufferInfo = new VkDescriptorBufferInfo({
                buffer: buffers[uniformBuffers[i]].buffer,
                offset: 0,
                range: VK_WHOLE_SIZE
            });

            const descriptorWriters = [
                new VkWriteDescriptorSet({
                    dstSet: x,
                    dstBinding: 0,
                    dstArrayElement: 0,
                    descriptorType: VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER,
                    descriptorCount: 1,
                    pBufferInfo: [ bufferInfo ]
                })
            ];

            vkUpdateDescriptorSets(device, descriptorWriters.length, descriptorWriters, 0, null);
        })
    }

    const createTexturesDescriptorPool = () => {
        const poolSizes = [
            new VkDescriptorPoolSize({
                type: VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
                descriptorCount: textures.length
            })
        ];

        const poolCreateInfo = new VkDescriptorPoolCreateInfo({
            poolSizeCount: poolSizes.length,
            pPoolSizes: poolSizes,
            maxSets: textures.length
        });

        if (vkCreateDescriptorPool(device, poolCreateInfo, null, texturesDescriptorPool) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create textures descriptor pool!';
        }
    }

    const createTexturesDescriptorSets = () => {
        const textureDstSet = createDescriptorSets(texturesDescriptorSetLayout, texturesDescriptorPool, textures.length);

        textures.forEach((x, i) => {
            const imageInfo = new VkDescriptorImageInfo({
                imageLayout: VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
                imageView: x.view,
                sampler: textureSampler
            });

            const descriptorWriter = new VkWriteDescriptorSet({
                dstSet: textureDstSet[i],
                dstBinding: 1,
                dstArrayElement: 0,
                descriptorType: VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER,
                descriptorCount: 1,
                pImageInfo: [ imageInfo ]
            });

            vkUpdateDescriptorSets(device, 1, [ descriptorWriter ], 0, null);

            x.descriptorSet = textureDstSet[i];
        });
    }

    const createAssetsDescriptorPool = () => {
        const poolSizes = [
            new VkDescriptorPoolSize({
                type: VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC,
                descriptorCount: 1
            })
        ];

        const poolCreateInfo = new VkDescriptorPoolCreateInfo({
            poolSizeCount: poolSizes.length,
            pPoolSizes: poolSizes,
            maxSets: 1
        });

        if (vkCreateDescriptorPool(device, poolCreateInfo, null, assetsDescriptorPool) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create assets descriptor pool!';
        }
    }

    const createAssetsDescriptorSets = () => {
        modelDescriptorSet = createDescriptorSets(assetsDescriptorSetLayout, assetsDescriptorPool, 1)[0];

        const bufferInfo = new VkDescriptorBufferInfo({
            buffer: buffers[modelBuffer].buffer,
            offset: 0,
            range: VK_WHOLE_SIZE
        });

        const descriptorWriter = new VkWriteDescriptorSet({
            dstSet: modelDescriptorSet,
            dstBinding: 2,
            dstArrayElement: 0,
            descriptorType: VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC,
            descriptorCount: 1,
            pBufferInfo: [ bufferInfo ]
        });
        
        vkUpdateDescriptorSets(device, 1, [ descriptorWriter ], 0, null);
    }

    const createDescriptorSets = (layout, pool, count = 1) => {
        const layouts = new Array(count).fill(null).map(() => layout);
        const allocInfo = new VkDescriptorSetAllocateInfo({
            descriptorPool: pool,
            descriptorSetCount: layouts.length,
            pSetLayouts: layouts
        });

        let descriptorSets = new Array(layouts.length).fill(null).map(() => new VkDescriptorSet());
        if (vkAllocateDescriptorSets(device, allocInfo, descriptorSets) !== VkResult.VK_SUCCESS) {
            throw 'Failed to allocate descriptor sets! ' + count;
        }

        return descriptorSets;
    }

    const createImageView = (image, format, aspectFlags = VK_IMAGE_ASPECT_COLOR_BIT) => {
        const imageViewCreateInfo = new VkImageViewCreateInfo({
            viewType: VK_IMAGE_VIEW_TYPE_2D,
            components: new VkComponentMapping({
                r: VK_COMPONENT_SWIZZLE_IDENTITY,
                g: VK_COMPONENT_SWIZZLE_IDENTITY,
                b: VK_COMPONENT_SWIZZLE_IDENTITY,
                a: VK_COMPONENT_SWIZZLE_IDENTITY
            }),
            subresourceRange: new VkImageSubresourceRange({
                aspectMask: aspectFlags,
                baseMipLevel: 0,
                levelCount: 1,
                baseArrayLayer: 0,
                layerCount: 1
            }),
            format,
            image
        });

        const imageView = new VkImageView();
        if (vkCreateImageView(device, imageViewCreateInfo, null, imageView) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create image view!';
        }

        return imageView;
    }

    const createTextureImage = (imgPath) => {
        const img = readtexture(imgPath);

        const bufferSize = img.byteLength;
        const stagingBuffer = new VkBuffer();
        const stagingBufferMemory = new VkDeviceMemory();
        createBuffer(bufferSize, VK_BUFFER_USAGE_TRANSFER_SRC_BIT, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT, stagingBuffer, stagingBufferMemory);
        copyData(stagingBufferMemory, bufferSize, img.data, Uint8Array);

        const textureImage = new VkImage();
        const textureImageMemory = new VkDeviceMemory();
        createImage(img.width, img.height, VK_FORMAT_R8G8B8A8_SRGB, VK_IMAGE_TILING_OPTIMAL, VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_SAMPLED_BIT, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, textureImage, textureImageMemory);
        
        transitionImageLayout(textureImage, VK_FORMAT_R8G8B8A8_SRGB, VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL);
        copyBufferToImage(stagingBuffer, textureImage, img.width, img.height);
        transitionImageLayout(textureImage, VK_FORMAT_R8G8B8A8_SRGB, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL);
    
        vkDestroyBuffer(device, stagingBuffer, null);
        vkFreeMemory(device, stagingBufferMemory, null);

        const textureImageView = createImageView(textureImage, VK_FORMAT_R8G8B8A8_SRGB);
        
        const imageIndex = textures.push({ 
            image: textureImage, 
            bufferMemory: textureImageMemory,
            view: textureImageView, 
            size: img.length, 
            width: img.width, 
            height: img.height 
        }) - 1;

        return imageIndex;
    }

    const createImage = (width, height, format, tiling, usage, properties, image, imageMemory) => {
        const imageInfo = new VkImageCreateInfo({
            imageType: VK_IMAGE_TYPE_2D,
            extent: new VkExtent3D({
                width: width,
                height: height,
                depth: 1
            }),
            mipLevels: 1,
            arrayLayers: 1,
            initialLayout: VK_IMAGE_LAYOUT_UNDEFINED,
            samples: VK_SAMPLE_COUNT_1_BIT,
            sharingMode: VK_SHARING_MODE_EXCLUSIVE,
            format,
            tiling,
            usage
        });

        if (vkCreateImage(device, imageInfo, null, image) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create image!';
        }

        const imageMemoryRequirements = new VkMemoryRequirements();
        vkGetImageMemoryRequirements(device, image, imageMemoryRequirements);
        
        const allocInfo = new VkMemoryAllocateInfo({
            allocationSize: imageMemoryRequirements.size,
            memoryTypeIndex: findMemoryType(physicalDevice, imageMemoryRequirements.memoryTypeBits, properties)
        });

        if (vkAllocateMemory(device, allocInfo, null, imageMemory) !== VkResult.VK_SUCCESS) {
            throw 'Failed to allocate image memory!';
        }

        vkBindImageMemory(device, image, imageMemory, 0);
    }

    const beginCommandBuffer = () => {
        const commandBufferInfo = new VkCommandBufferAllocateInfo({
            level: VK_COMMAND_BUFFER_LEVEL_PRIMARY,
            commandPool: commandPool,
            commandBufferCount: 1
        });

        const commandBuffer = new VkCommandBuffer();
        vkAllocateCommandBuffers(device, commandBufferInfo, [ commandBuffer ]);

        const beginInfo = new VkCommandBufferBeginInfo({
            flags: VK_COMMAND_BUFFER_USAGE_ONE_TIME_SUBMIT_BIT
        });
        vkBeginCommandBuffer(commandBuffer, beginInfo);

        return commandBuffer;
    }

    const endCommandBuffer = (commandBuffer) => {
        vkEndCommandBuffer(commandBuffer);

        const submitInfo = new VkSubmitInfo({
            commandBufferCount: 1,
            pCommandBuffers: [ commandBuffer ]
        });
        
        vkQueueSubmit(graphicsQueue, 1, [ submitInfo ], null);

        vkQueueWaitIdle(graphicsQueue);

        vkFreeCommandBuffers(device, commandPool, 1, [ commandBuffer ]);
    }

    const transitionImageLayout = (image, format, oldLayout, newLayout) => {
        const commandBuffer = beginCommandBuffer();
        
        const barrier = new VkImageMemoryBarrier({
            srcQueueFamilyIndex: VK_QUEUE_FAMILY_IGNORED,
            dstQueueFamilyIndex: VK_QUEUE_FAMILY_IGNORED,
            subresourceRange: new VkImageSubresourceRange({
                aspectMask: VK_IMAGE_ASPECT_COLOR_BIT,
                baseMipLevel: 0,
                levelCount: 1,
                baseArrayLayer: 0,
                layerCount: 1
            }),
            srcAccessMask: 0,
            dstAccessMask: 0,
            image,
            oldLayout,
            newLayout
        });

        if (newLayout == VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL) {
            barrier.subresourceRange.aspectMask = VK_IMAGE_ASPECT_DEPTH_BIT;
            
            if (hasStencilComponent(format)) {
                barrier.subresourceRange.aspectMask |= VK_IMAGE_ASPECT_STENCIL_BIT;
            }
        }

        let sourceStage = 0;
        let destinationStage = 0;

        if (oldLayout === VK_IMAGE_LAYOUT_UNDEFINED && newLayout === VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL) {
            barrier.srcAccessMask = 0;
            barrier.dstAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;

            sourceStage = VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT;
            destinationStage = VK_PIPELINE_STAGE_TRANSFER_BIT;
        } 
        else if (oldLayout === VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL && newLayout === VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL) {
            barrier.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
            barrier.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;

            sourceStage = VK_PIPELINE_STAGE_TRANSFER_BIT;
            destinationStage = VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT;
        }
        else if (oldLayout == VK_IMAGE_LAYOUT_UNDEFINED && newLayout == VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL) {
            barrier.srcAccessMask = 0;
            barrier.dstAccessMask = VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_READ_BIT | VK_ACCESS_DEPTH_STENCIL_ATTACHMENT_WRITE_BIT;
        
            sourceStage = VK_PIPELINE_STAGE_TOP_OF_PIPE_BIT;
            destinationStage = VK_PIPELINE_STAGE_EARLY_FRAGMENT_TESTS_BIT;
        }
        else {
            throw 'unsupported layout transition!';
        }

        vkCmdPipelineBarrier(commandBuffer, sourceStage, destinationStage, 0, 0, null, 0, null, 1, [ barrier ]);

        endCommandBuffer(commandBuffer);
    }

    const copyBufferToImage = (buffer, image, width, height) => {
        const commandBuffer = beginCommandBuffer();

        const region = new VkBufferImageCopy({
            bufferOffset: 0,
            bufferRowLength: 0,
            bufferImageHeight: 0,
            imageSubresource: new VkImageSubresourceLayers({
                aspectMask: VK_IMAGE_ASPECT_COLOR_BIT,
                mipLevel: 0,
                baseArrayLayer: 0,
                layerCount: 1
            }),
            imageOffset: new VkOffset3D({
                x: 0,
                y: 0,
                z: 0
            }),
            imageExtent: new VkExtent3D({
                depth: 1,
                width,
                height
            })
        });

        vkCmdCopyBufferToImage(commandBuffer, buffer, image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, [ region ]);

        endCommandBuffer(commandBuffer);
    }

    const createTextureSampler = () => {
        const samplerInfo = new VkSamplerCreateInfo({
            magFilter: VK_FILTER_LINEAR,
            minFilter: VK_FILTER_LINEAR,
            addressModeU: VK_SAMPLER_ADDRESS_MODE_REPEAT,
            addressModeV: VK_SAMPLER_ADDRESS_MODE_REPEAT,
            addressModeW: VK_SAMPLER_ADDRESS_MODE_REPEAT,
            anisotropyEnable: false,
            maxAnisotropy: 1.0,
            borderColor: VK_BORDER_COLOR_INT_OPAQUE_BLACK,
            unnormalizedCoordinates: false,
            compareEnable: false,
            compareOp: VK_COMPARE_OP_ALWAYS,
            mipmapMode: VK_SAMPLER_MIPMAP_MODE_LINEAR,
            mipLodBias: 0,
            minLod: 0,
            maxLod: 0
        });

        if (vkCreateSampler(device, samplerInfo, null, textureSampler) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create texture sampler!';
        }
    }

    const createDepthResource = () => {
        const depthFormat = findDepthFormat();
        
        createImage(swapchainExtent.width, swapchainExtent.height, depthFormat, VK_IMAGE_TILING_OPTIMAL, VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, depthImage, depthImageMemory);
        depthImageView = createImageView(depthImage, depthFormat, VK_IMAGE_ASPECT_DEPTH_BIT);
        
        transitionImageLayout(depthImage, depthFormat, VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL);
    }

    const findDepthFormat = () => {
        return findSupportedFormat(
            physicalDevice, 
            [ VK_FORMAT_D32_SFLOAT, VK_FORMAT_D32_SFLOAT_S8_UINT, VK_FORMAT_D24_UNORM_S8_UINT ],
            VK_IMAGE_TILING_OPTIMAL,
            VK_FORMAT_FEATURE_DEPTH_STENCIL_ATTACHMENT_BIT
        );
    }

    const initDescriptors = () => {
        createTexturesDescriptorPool();
        createTexturesDescriptorSets();

        const data = new Float32Array(assets.reduce((acc, x) => [...acc, ...x.model], []));
        
        modelBuffer = createUniformBuffer(data, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT);

        createAssetsDescriptorPool();
        createAssetsDescriptorSets();
    }

    createInstance();
    setupDebugMessenger();
    createSurface();
    createPhysicalDevice();
    createDevice();
    createCommandPool();
    createSwapchain();
    createImageViews();
    createDepthResource();
    createRenderPass();
    createGraphicsPipeline();
    createFrameBuffers();
    createProjectionMatrix();
    createViewMatrix({ position: { x: 0, y: 0.0, z: -3.0 }});
    createUniformBuffers();
    createUniformDescriptorPool();
    createUniformDescriptorSets();
    createCommandBuffers();
    createSyncObjects();
    createTextureSampler();

    window.onresize = () => {
        frameBufferResized = true;
    }

    return {
        window,
        drawFrame,
        createVertexBuffer,
        createIndexBuffer,
        createTextureImage,
        recreateSwapchain,
        createAsset,
        initDescriptors,
        updateAsset
    }
}

function findMemoryType(physicalDevice, typeFilter, properties) {
    const memProperties = new VkPhysicalDeviceMemoryProperties();
    vkGetPhysicalDeviceMemoryProperties(physicalDevice, memProperties);
    
    for (let i = 0; i < memProperties.memoryTypeCount; i++) {
        if ((typeFilter & (1 << i)) && (memProperties.memoryTypes[i].propertyFlags & properties) === properties) {
            return i;
        }
    }

    throw 'Failed to find suitable memory type!';
}

export function readtexture(path) {
    const buffer = fs.readFileSync(path);

    try {
        const img = PNG.sync.read(buffer);
        const data = new Uint8Array(img.data);

        return {
            byteLength: data.byteLength,
            width: img.width, 
            height: img.height, 
            data
        }
    }
    catch(err) {
        console.error(err);

        throw `Failed to read texture: ${path}`;
    }
}

function findSupportedFormat(physicalDevice, canditates, tiling, features) {
    for(let i = 0; i < canditates.length; i++) {
        const format = canditates[i];
        const properties = new VkFormatProperties();
        vkGetPhysicalDeviceFormatProperties(physicalDevice, format, properties);
        
        if (tiling === VK_IMAGE_TILING_LINEAR && (properties.linearTilingFeatures & features) == features) {
            return format;
        } 
        else if (tiling === VK_IMAGE_TILING_OPTIMAL && (properties.optimalTilingFeatures & features) == features) {
            return format;
        }
    }
    
    throw 'Failed to find supported format!';
}

function hasStencilComponent(format) {
    return format == VK_FORMAT_D32_SFLOAT_S8_UINT || format == VK_FORMAT_D24_UNORM_S8_UINT;
}

function readShader(path, type) {
    let {output, error} = GLSL.toSPIRVSync({
        source: fs.readFileSync(path),
        extension: type
    });

    if (error) {
        throw `${error}`;
    }

    return output;
}

function chooseSwapchainExtent(capabilities, window) {
    if (capabilities.currentExtent.width != Number.MAX_VALUE) {
        return capabilities.currentExtent;
    }
    
    const actualExtent = new VkExtent2D({ width: window.frameBufferWidth, height: window.frameBufferHeight });

    actualExtent.width = Math.max(capabilities.minImageExtent.width, 
        Math.min(capabilities.maxImageExtent.width, actualExtent.width));
    
    actualExtent.height = Math.max(capabilities.minImageExtent.height, 
        Math.min(capabilities.maxImageExtent.height, actualExtent.height));

    return actualExtent;
}

function chooseSwapchainPresentMode(swapchainPresentModes) {
    let presentMode = VK_PRESENT_MODE_FIFO_KHR;

    swapchainPresentModes.some((x) => {
        if (x === VK_PRESENT_MODE_MAILBOX_KHR) {
            presentMode = x;

            return true;
        }

        return false;
    });

    return presentMode;
}

function chooseSwapchainSurfaceFormat(swapchainFormats) {
    let surfaceFormat = swapchainFormats[0];

    swapchainFormats.some((x) => {
        if (x.format === VK_FORMAT_B8G8R8A8_SRGB && x.colorSpace === VK_COLOR_SPACE_SRGB_NONLINEAR_KHR) {
            surfaceFormat = x;

            return true;
        }

        return false;
    });

    return surfaceFormat;
}

function checkInstanceExtensions(extensionNames) {
    let extensionsCount = { $: 0 };
    vkEnumerateInstanceExtensionProperties(null, extensionsCount, null);
    let extensions = new Array(extensionsCount.$).fill(null).map(() => new VkExtensionProperties());
    vkEnumerateInstanceExtensionProperties(null, extensionsCount, extensions);

    let result = true;

    extensionNames.forEach(x => {
        if (!extensions.find((y) => y.extensionName == x)) {
            console.warn(x + " not available");
            result = false;
        }
    });

    return result;
}

function checkDeviceExtensions(extensionNames, device) {
    let extensionsCount = { $: 0 };
    vkEnumerateDeviceExtensionProperties(device, null, extensionsCount, null);
    let extensions = new Array(extensionsCount.$).fill(null).map(() => new VkExtensionProperties());
    vkEnumerateDeviceExtensionProperties(device, null, extensionsCount, extensions);

    let result = true;

    extensionNames.forEach(x => {
        if (!extensions.find((y) => y.extensionName == x)) {
            console.warn(x + " not available");
            result = false;
        }
    });

    return result;
}

function checkValidationLayers(layerNames, outLayers) {
    let layersCount = { $: 0 };
    vkEnumerateInstanceLayerProperties(layersCount, null);
    let layers = new Array(layersCount.$).fill(null).map(() => new VkLayerProperties());
    vkEnumerateInstanceLayerProperties(layersCount, layers);

    let result = true;
    console.log(layers.map(x => x.layerName));
    layerNames.forEach(x => {
        if (!layers.find((y) => y.layerName == x)) {
            console.warn(x + " not available");
            result = false;
        }
        else {
            outLayers.push(x);
        }
    });

    return result;
}

function isPhysicalDeviceSuitable(physicalDevice) {
    const physicalDeviceProperties = new VkPhysicalDeviceProperties();
    vkGetPhysicalDeviceProperties(physicalDevice, physicalDeviceProperties);

    const physicalDeviceFeatures = new VkPhysicalDeviceFeatures();
    vkGetPhysicalDeviceFeatures(physicalDevice, physicalDeviceFeatures);

    const extensionsSupported = checkDeviceExtensions(deviceExtensions, physicalDevice);

    //physicalDeviceProperties.deviceType == VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU
    return physicalDeviceFeatures.geometryShader && extensionsSupported && physicalDeviceFeatures.samplerAnisotropy;
}

function querySurfaceSupport(physicalDevice, surface, swapchainSupportDetails) {
    const capabilities = new VkSurfaceCapabilitiesKHR();
    vkGetPhysicalDeviceSurfaceCapabilitiesKHR(physicalDevice, surface, capabilities);

    const formatCount = { $: 0 };
    vkGetPhysicalDeviceSurfaceFormatsKHR(physicalDevice, surface, formatCount, null);
    const formats = new Array(formatCount.$).fill(null).map(x => new VkSurfaceFormatKHR());
    if(formatCount.$ !== 0) {
        vkGetPhysicalDeviceSurfaceFormatsKHR(physicalDevice, surface, formatCount, formats);
    }

    const presentModeCount = { $: 0 };
    vkGetPhysicalDeviceSurfacePresentModesKHR(physicalDevice, surface, presentModeCount, null);
    const presentModes = new Int32Array(presentModeCount.$).fill(0);
    if (presentModeCount.$) {
        vkGetPhysicalDeviceSurfacePresentModesKHR(physicalDevice, surface, presentModeCount, presentModes);
    }

    const result = formats.length > 0 && presentModes.length > 0;

    if (result && swapchainSupportDetails) {
        swapchainSupportDetails.capabilities = capabilities;
        swapchainSupportDetails.formats = formats;
        swapchainSupportDetails.presentModes = presentModes;
    }

    return result;
}

function findQueueFamilies(physicalDevice, surface, familyIndeces) {
    const queueFamiliesCount = { $: 0 };
    vkGetPhysicalDeviceQueueFamilyProperties(physicalDevice, queueFamiliesCount, null);

    const queueFamilies = new Array(queueFamiliesCount.$).fill(null).map(x => new VkQueueFamilyProperties());
    vkGetPhysicalDeviceQueueFamilyProperties(physicalDevice, queueFamiliesCount, queueFamilies);

    let graphicsFamily = null;
    let presentFamily = null;

    let result = queueFamilies.some((x, i) => {
        if (x.queueFlags & VK_QUEUE_GRAPHICS_BIT) {
            graphicsFamily = i;
        }

        let presentSupport = { $: false };
        vkGetPhysicalDeviceSurfaceSupportKHR(physicalDevice, i, surface, presentSupport);
        if (presentSupport.$) {
            presentFamily = i;
        }

        return graphicsFamily !== null && presentSupport.$ !== false;
    });

    if (result && familyIndeces) {
        familyIndeces.graphicsFamily = graphicsFamily;
        familyIndeces.presentFamily = presentFamily;
    }

    return result;
}

function debugMessageCallback(messageSeverity, messageType, pCallbackData, pUserData) {
    if (messageSeverity >= VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT) {
        console.log("validation layer: " + pCallbackData.pMessage);
    }

    return false;
}