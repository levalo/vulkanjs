import nvk from 'nvk';
import fs from 'fs';
import { PNG } from 'pngjs';
import { GLSL } from 'nvk-essentials';

Object.assign(global, nvk);

const VALIDATION_LAYERS = [ 'VK_LAYER_RENDERDOC_Capture','VK_LAYER_LUNARG_standard_validation' ];
const DEVICE_EXTENSIONS = [ 'VK_KHR_swapchain', 'VK_EXT_descriptor_indexing' ];
const INSTANCE_EXTENSIONS = [ 'VK_EXT_debug_utils', 'VK_KHR_get_physical_device_properties2' ];
const MAX_FRAMES_IN_FLAIGHT = 2;
const MIN_MIP_LEVEL = 0;
const MAX_MIP_LEVEL = 12;
const BUFFERS = [];
const TEXTURES = [];
export const SHADER_TYPES = { 'frag': VK_SHADER_STAGE_FRAGMENT_BIT, 'vert': VK_SHADER_STAGE_VERTEX_BIT };
export const DESCRIPTOR_TYPES = { 'uniform': VK_DESCRIPTOR_TYPE_UNIFORM_BUFFER_DYNAMIC, 'texture': VK_DESCRIPTOR_TYPE_COMBINED_IMAGE_SAMPLER };
export const FORMATS = { 'rgb': VK_FORMAT_R32G32B32_SFLOAT, 'rg': VK_FORMAT_R32G32_SFLOAT };

export function vkContext(window) {
    const context = initVkContext(window);
    
    let swapchain = null;

    let onRecreateSwapchain = () => null;

    return {
        createSwapchain: () => swapchain = createSwapchain(context),
        createPipeline: (layout, shaderStages, attributes, vertexType) => createPipeline(context, swapchain, layout, shaderStages, attributes, vertexType),
        createPipelineLayout: (descriptorSetLayouts, pushConstantsSize, pushConstantsCount) => createPipelineLayout(context, descriptorSetLayouts, pushConstantsSize, pushConstantsCount),
        createBufferDescriptorSet: (type, stage, buffer) => createDescriptorSet(context, type, stage, [ buffer ], null, 1),
        createTexturesDescriptorSet: (type, stage, textures) => createDescriptorSet(context, type, stage, null, textures, textures.length),
        createUniformBuffer: (data) => createUniformBuffer(context, data),
        createShaderStages: (name) => createShaderStages(context, name),
        createVertexBuffer: (vertices) => createVertexBuffer(context, vertices),
        createIndexBuffer: (indices) => createIndexBuffer(context, indices),
        createTextureImage: (imgPath) => createTextureImage(context, imgPath),
        cleanupSwapchain: (pipelines) => cleanupSwapchain(context, swapchain, pipelines),
        updateBuffer: (index, data, offset) => updateBuffer(context, index, data, offset),
        drawFrame: () => drawFrame(context, swapchain, onRecreateSwapchain),
        setOnSwapchainRecreateHandler: (func) => onRecreateSwapchain = func,
        getCurrentSwapchain: () => swapchain,
        writeCommandBuffers: (func) => swapchain.swapchainFramebuffers.forEach((x, i) => func(x, swapchain.commandBuffers[i])),
        frameBufferResized: (status) => context.frameBufferResized = status,
        beginRenderPass: (frameBuffer, commandBuffer) => beginRenderPass(context, swapchain, frameBuffer, commandBuffer),
        setupDebugMessenger: () => setupDebugMessenger(context),
        endRenderPass: endRenderPass,
        bindPipeline: bindPipeline,
        bindVertexBuffer: bindVertexBuffer,
        bindIndexBuffer: bindIndexBuffer,
        bindDescriptorSet: bindDescriptorSet,
        drawIndexed: drawIndexed,
        pushConstants: pushConstants
    }
}

function initVkContext(window) {
    const instance = createInstance(window);
    const surface = createSurface(window, instance);
    const physicalDevice = createPhysicalDevice(instance, surface);
    const { device, graphicsQueue, presentQueue, queueFamilyIndeces } = createDevice(surface, physicalDevice);
    const commandPool = createCommandPool(device, queueFamilyIndeces.graphicsFamily);
    const depthFormat = findSupportedFormat(physicalDevice, [ VK_FORMAT_D32_SFLOAT, VK_FORMAT_D32_SFLOAT_S8_UINT, VK_FORMAT_D24_UNORM_S8_UINT ], VK_IMAGE_TILING_OPTIMAL, VK_FORMAT_FEATURE_DEPTH_STENCIL_ATTACHMENT_BIT);
    const { surfaceFormat, presentMode, imageCount } = findSwapchainInfo(surface, physicalDevice);
    const renderPass = createRenderPass(device, surfaceFormat, depthFormat);
    const { imageAvailableSemaphores, renderFinishedSemaphores, inFlightFences, imagesInFlight } = createSyncObjects(device, imageCount);
    const textureSampler = createTextureSampler(device);

    return {
        window,
        instance,
        surface,
        physicalDevice,
        device, graphicsQueue, presentQueue, queueFamilyIndeces,
        commandPool,
        depthFormat,
        surfaceFormat, presentMode, imageCount,
        renderPass,
        imageAvailableSemaphores, renderFinishedSemaphores, inFlightFences, imagesInFlight,
        textureSampler,
        frameBufferResized: false,
        currentFrame: 0
    };
}

function createSwapchain(context, oldSwapchain = null) {
    const swapchainSupportDetails = { capabilities: null };
    querySurfaceSupport(context.physicalDevice, context.surface, swapchainSupportDetails);

    const swapchainExtent = chooseSwapchainExtent(swapchainSupportDetails.capabilities, context.window);

    const swapchainCreateInfo = new VkSwapchainCreateInfoKHR({
        surface: context.surface,
        minImageCount: context.imageCount,
        imageFormat: context.surfaceFormat.format,
        imageColorSpace: context.surfaceFormat.colorSpace,
        imageExtent: swapchainExtent,
        imageArrayLayers: 1,
        imageUsage: VK_IMAGE_USAGE_COLOR_ATTACHMENT_BIT,
        preTransform: swapchainSupportDetails.capabilities.currentTransform,
        compositeAlpha: VK_COMPOSITE_ALPHA_OPAQUE_BIT_KHR,
        presentMode: context.presentMode,
        clipped: true,
        oldSwapchain: oldSwapchain 
    });

    if (context.queueFamilyIndeces.graphicsFamily != context.queueFamilyIndeces.presentFamily) {
        swapchainCreateInfo.imageSharingMode = VK_SHARING_MODE_CONCURRENT;
        swapchainCreateInfo.queueFamilyIndexCount = 2;
        swapchainCreateInfo.pQueueFamilyIndices = [ context.queueFamilyIndeces.graphicsFamily, context.queueFamilyIndeces.presentFamily ];
    }
    else {
        swapchainCreateInfo.imageSharingMode = VK_SHARING_MODE_EXCLUSIVE;
        swapchainCreateInfo.queueFamilyIndexCount = 0;
        swapchainCreateInfo.pQueueFamilyIndices = null;
    }

    const swapchain = new VkSwapchainKHR();
    if (vkCreateSwapchainKHR(context.device, swapchainCreateInfo, null, swapchain) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create swap chain!';
    }

    const swapchainImageCount = { $: 0 };
    vkGetSwapchainImagesKHR(context.device, swapchain, swapchainImageCount, null);
    const swapchainImages = new Array(swapchainImageCount.$).fill(null).map(x => new VkImage());
    vkGetSwapchainImagesKHR(context.device, swapchain, swapchainImageCount, swapchainImages);

    const swapchainImageViews = new Array(swapchainImages.length).fill(null).map(x => new VkImageView());

    swapchainImages.forEach((x, i) => {
        swapchainImageViews[i] = createImageView(context, x, context.surfaceFormat.format, 1);
    });
    
    const [depthImage, depthImageMemory] = createImage(context, swapchainExtent.width, swapchainExtent.height, 1, context.depthFormat, VK_IMAGE_TILING_OPTIMAL, VK_IMAGE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);
    const depthImageView = createImageView(context, depthImage, context.depthFormat, 1, VK_IMAGE_ASPECT_DEPTH_BIT);
    
    transitionImageLayout(context, depthImage, context.depthFormat, VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_DEPTH_STENCIL_ATTACHMENT_OPTIMAL, 1);

    const swapchainFramebuffers = new Array(swapchainImageViews.length).fill(null).map(() => new VkFramebuffer());

    swapchainImageViews.forEach((x, i) => {
        const frameBufferInfo = new VkFramebufferCreateInfo({
            renderPass: context.renderPass,
            attachmentCount: 2,
            pAttachments: [ x, depthImageView ],
            width: swapchainExtent.width,
            height: swapchainExtent.height,
            layers: 1
        });

        if (vkCreateFramebuffer(context.device, frameBufferInfo, null, swapchainFramebuffers[i]) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create framebuffer!';
        }
    });

    const commandBuffers = new Array(swapchainFramebuffers.length).fill(null).map(() => new VkCommandBuffer());

    const commandBufferAllocateInfo = new VkCommandBufferAllocateInfo({
        commandPool: context.commandPool,
        level: VK_COMMAND_BUFFER_LEVEL_PRIMARY,
        commandBufferCount: commandBuffers.length
    });

    if (vkAllocateCommandBuffers(context.device, commandBufferAllocateInfo, commandBuffers) !== VkResult.VK_SUCCESS) {
        throw 'Failed to allocate command buffers!';
    }

    return {
        swapchain,
        swapchainImages,
        swapchainExtent,
        swapchainImageViews,
        depthImage,
        depthImageMemory,
        depthImageView,
        swapchainFramebuffers,
        commandBuffers
    }
}

function cleanupSwapchain({ device, commandPool }, { swapchain, swapchainImageViews, depthImageView, swapchainFramebuffers, commandBuffers }, pipelines) {
    vkDeviceWaitIdle(device);

    pipelines.forEach(x => vkDestroyPipeline(device, x, null));

    vkFreeCommandBuffers(device, commandPool, commandBuffers.length, commandBuffers);

    swapchainFramebuffers.forEach(x => vkDestroyFramebuffer(device, x, null));

    vkDestroyImageView(device, depthImageView, null);

    swapchainImageViews.forEach(x => vkDestroyImageView(device, x, null));
    
    vkDestroySwapchainKHR(device, swapchain, null);
}

function drawFrame(context, { swapchain, commandBuffers }, recreateSwapchain) {
    const { window, imageAvailableSemaphores, renderFinishedSemaphores, inFlightFences, imagesInFlight, currentFrame, device, graphicsQueue, presentQueue } = context;

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

    if (result === VK_ERROR_OUT_OF_DATE_KHR || result === VK_SUBOPTIMAL_KHR || context.frameBufferResized) {
        context.frameBufferResized = false;

        recreateSwapchain();
    }
    else if (result !== VkResult.VK_SUCCESS) {
        throw 'Failed to present swap chain image!'
    }

    context.currentFrame = (currentFrame + 1) % MAX_FRAMES_IN_FLAIGHT;
}

function createPipeline(context, swapchain, pipelineLayout, shaderStages, attributes, vertexType) {

    const stride = attributes.reduce((acc, x) => acc + x.size, 0);

    const bindingDescriptions = [
        new VkVertexInputBindingDescription({
            binding: 0,
            stride: stride * vertexType,
            inputRate: VK_VERTEX_INPUT_RATE_VERTEX
        })
    ];

    const attributeDescriptions = attributes.map((x, i) => new VkVertexInputAttributeDescription({
        binding: 0,
        location: i,
        format: x.format,
        offset: x.offset * vertexType
    }));

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
        width: swapchain.swapchainExtent.width,
        height: swapchain.swapchainExtent.height,
        minDepth: 0.0,
        maxDepth: 1.0
    });

    const scissor = new VkRect2D({
        offset: new VkOffset2D({
            x: 0,
            y: 0
        }),
        extent: swapchain.swapchainExtent
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
        renderPass: context.renderPass,
        subpass: 0,
        basePipelineHandle: null,
        basePipelineIndex: -1,
        pDepthStencilState: depthStencilInfo
        //pDynamicState: dynamicStateInfo
    });

    const graphicsPipeline = new VkPipeline();
    if (vkCreateGraphicsPipelines(context.device, null, 1, [ graphicsPipelineInfo ], null, [ graphicsPipeline ]) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create graphics pipeline!';
    }

    return graphicsPipeline;
}

function createPipelineLayout(context, descriptorLayouts = [], pushConstantsCount = 0, pushConstantsSize = Int32Array.BYTES_PER_ELEMENT) {
    const pushConstantsRanges = (new Array(pushConstantsCount)).fill(null).map((x, i) => new VkPushConstantRange({
        offset: i,
        size: pushConstantsSize
    }));

    const pipelineLayoutInfo = new VkPipelineLayoutCreateInfo({
        setLayoutCount: descriptorLayouts.length,
        pSetLayouts: descriptorLayouts,
        pushConstantRangeCount: pushConstantsCount,
        pPushConstantRanges: pushConstantsCount ? pushConstantsRanges : null
    });

    const pipelineLayout = new VkPipelineLayout();
    if (vkCreatePipelineLayout(context.device, pipelineLayoutInfo, null, pipelineLayout) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create pipeline layout!';
    }

    return pipelineLayout;
}

function createShaderStages(context, name) {
    const shaderFiles = fs.readdirSync(`glsl/${name}`);

    const shaderStages = shaderFiles.map((x) => createShaderModule(context, `glsl/${name}/${x}`));

    return shaderStages;
} 

function createDescriptorSet(context, type, stage, buffers, textures, size = 1) {
    const descriptorBinding = new VkDescriptorSetLayoutBinding({
        binding: 0,
        descriptorType: type,
        descriptorCount: size,
        stageFlags: stage
    });

    const descriptorSetLayoutCreateInfo = new VkDescriptorSetLayoutCreateInfo({
        bindingCount: 1,
        pBindings: [ descriptorBinding ]
    });

    const descriptorSetLayout = new VkDescriptorSetLayout();
    if (vkCreateDescriptorSetLayout(context.device, descriptorSetLayoutCreateInfo, null, descriptorSetLayout) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create descriptor set layout!';
    }

    const poolCreateInfo = new VkDescriptorPoolCreateInfo({
        poolSizeCount: 1,
        pPoolSizes: [
            new VkDescriptorPoolSize({
                type: type,
                descriptorCount: size
            })
        ],
        maxSets: 1
    });

    const descriptorPool = new VkDescriptorPool();
    if (vkCreateDescriptorPool(context.device, poolCreateInfo, null, descriptorPool) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create uniform descriptor pool!';
    }

    const descriptorAllocInfo = new VkDescriptorSetAllocateInfo({
        descriptorPool: descriptorPool,
        descriptorSetCount: 1,
        pSetLayouts: [ descriptorSetLayout ]
    });

    const descriptorSet = new VkDescriptorSet();
    if (vkAllocateDescriptorSets(context.device, descriptorAllocInfo, [ descriptorSet ]) !== VkResult.VK_SUCCESS) {
        throw 'Failed to allocate descriptor set!';
    }

    const descriptorWriter = new VkWriteDescriptorSet({
        dstSet: descriptorSet,
        dstBinding: 0,
        dstArrayElement: 0,
        descriptorType: type,
        descriptorCount: size,
        pBufferInfo: buffers ? buffers.map(y => new VkDescriptorBufferInfo({
            buffer: BUFFERS[y].buffer,
            offset: 0,
            range: VK_WHOLE_SIZE
        })) : null,
        pImageInfo: textures ? textures.map(y => new VkDescriptorImageInfo({
            imageLayout: VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL,
            imageView: TEXTURES[y].view,
            sampler: context.textureSampler
        })) : null
    });
    
    vkUpdateDescriptorSets(context.device, 1, [ descriptorWriter ], 0, null);

    return [ descriptorSetLayout, descriptorSet ];
}

function beginRenderPass(context, swapchain, frameBuffer, commandBuffer) {
    const beginInfo = new VkCommandBufferBeginInfo({
        flags: 0,
        pInheritanceInfo: null
    });

    if (vkBeginCommandBuffer(commandBuffer, beginInfo) !== VkResult.VK_SUCCESS) {
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
        renderPass: context.renderPass,
        framebuffer: frameBuffer,
        clearValueCount: 2,
        pClearValues: [clearColor, clearDepth],
        renderArea: new VkRect2D({
            offset: new VkOffset2D({
                x: 0,
                y: 0
            }),
            extent: swapchain.swapchainExtent
        })
    });

    vkCmdBeginRenderPass(commandBuffer, renderPassBeginInfo, VK_SUBPASS_CONTENTS_INLINE);
}

function endRenderPass(commandBuffer) {
    vkCmdEndRenderPass(commandBuffer);

    if (vkEndCommandBuffer(commandBuffer) !== VkResult.VK_SUCCESS) {
        throw 'Failed to record command buffer!';
    }
}

function bindPipeline(commandBuffer, pipeline) {
    vkCmdBindPipeline(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, pipeline);
}

function bindVertexBuffer(commandBuffer, firstBinding, bindingCount, buffers, offsets) {
    vkCmdBindVertexBuffers(commandBuffer, firstBinding, bindingCount, buffers.map(x => BUFFERS[x].buffer), offsets);
}

function bindIndexBuffer(commandBuffer, bufferIndex, offset) {
    vkCmdBindIndexBuffer(commandBuffer, BUFFERS[bufferIndex].buffer, offset, VK_INDEX_TYPE_UINT16);
}

function bindDescriptorSet(commandBuffer, pipelineLayout, firstSet, sets, offsetsCount, offsets) {
    vkCmdBindDescriptorSets(commandBuffer, VK_PIPELINE_BIND_POINT_GRAPHICS, pipelineLayout, firstSet, sets.length, sets, offsetsCount, offsets);
}

function pushConstants(commandBuffer, pipelineLayout, stage, offset, value) {
    vkCmdPushConstants(commandBuffer, pipelineLayout, stage, offset, value.byteLength, value.buffer);
}

function drawIndexed(commandBuffer, indicesCount, assetsLength) {
    vkCmdDrawIndexed(commandBuffer, indicesCount,assetsLength, 0, 0, 0);
}

export function setupDebugMessenger({ instance }) {

    const debugMessengerCreateInfo = new VkDebugUtilsMessengerCreateInfoEXT({
        messageSeverity: VK_DEBUG_UTILS_MESSAGE_SEVERITY_VERBOSE_BIT_EXT | VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT | VK_DEBUG_UTILS_MESSAGE_SEVERITY_ERROR_BIT_EXT | VK_DEBUG_UTILS_MESSAGE_SEVERITY_INFO_BIT_EXT,
        messageType: VK_DEBUG_UTILS_MESSAGE_TYPE_GENERAL_BIT_EXT | VK_DEBUG_UTILS_MESSAGE_TYPE_VALIDATION_BIT_EXT | VK_DEBUG_UTILS_MESSAGE_TYPE_PERFORMANCE_BIT_EXT,
        pfnUserCallback: debugMessageCallback
    });

    const debugMessenger = new VkDebugUtilsMessengerEXT();
    if (vkCreateDebugUtilsMessengerEXT(instance, debugMessengerCreateInfo, null, debugMessenger) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create debug messenger!';
    }
}

function debugMessageCallback(messageSeverity, messageType, pCallbackData, pUserData) {
    if (messageSeverity >= VK_DEBUG_UTILS_MESSAGE_SEVERITY_WARNING_BIT_EXT) {
        console.log("validation layer: " + pCallbackData.pMessage);
    }

    return false;
}

function readShader(path, type) {
    let {output, error} = GLSL.toSPIRVSync({
        source: fs.readFileSync(`${path}.${type}`),
        extension: type
    });

    if (error) {
        throw `${error}`;
    }

    return output;
}

function createShaderModule(context, fileName) {
    const [ path, type ] = fileName.split('.');
    const shaderCode = readShader(path, type);

    const shaderModuleCreateInfo = new VkShaderModuleCreateInfo({
        codeSize: shaderCode.byteLength,
        pCode: shaderCode
    });

    const shaderModule = new VkShaderModule();
    if(vkCreateShaderModule(context.device, shaderModuleCreateInfo, null, shaderModule) != VkResult.VK_SUCCESS) {
        throw 'Failed to create shader module!';
    }

    const shaderStage = new VkPipelineShaderStageCreateInfo({
        stage: SHADER_TYPES[type],
        module: shaderModule,
        pName: 'main'
    })

    return shaderStage;
}

function createTextureSampler(device, minMipLevel = MIN_MIP_LEVEL, maxMipLevel = MAX_MIP_LEVEL) {
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
        minLod: minMipLevel,
        maxLod: maxMipLevel
    });

    const textureSampler = new VkSampler();
    if (vkCreateSampler(device, samplerInfo, null, textureSampler) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create texture sampler!';
    }

    return textureSampler;
}

function createImageView(context, image, format, mipLevels, aspectFlags = VK_IMAGE_ASPECT_COLOR_BIT) {
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
            levelCount: mipLevels,
            baseArrayLayer: 0,
            layerCount: 1
        }),
        format,
        image
    });

    const imageView = new VkImageView();
    if (vkCreateImageView(context.device, imageViewCreateInfo, null, imageView) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create image view!';
    }

    return imageView;
}

function createImage(context, width, height, mipLevels, format, tiling, usage, properties) {
    const imageInfo = new VkImageCreateInfo({
        imageType: VK_IMAGE_TYPE_2D,
        extent: new VkExtent3D({
            width: width,
            height: height,
            depth: 1
        }),
        arrayLayers: 1,
        initialLayout: VK_IMAGE_LAYOUT_UNDEFINED,
        samples: VK_SAMPLE_COUNT_1_BIT,
        sharingMode: VK_SHARING_MODE_EXCLUSIVE,
        mipLevels,
        format,
        tiling,
        usage
    });

    const image = new VkImage();
    const imageMemory = new VkDeviceMemory();
    if (vkCreateImage(context.device, imageInfo, null, image) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create image!';
    }

    const imageMemoryRequirements = new VkMemoryRequirements();
    vkGetImageMemoryRequirements(context.device, image, imageMemoryRequirements);
    
    const allocInfo = new VkMemoryAllocateInfo({
        allocationSize: imageMemoryRequirements.size,
        memoryTypeIndex: findMemoryType(context.physicalDevice, imageMemoryRequirements.memoryTypeBits, properties)
    });

    if (vkAllocateMemory(context.device, allocInfo, null, imageMemory) !== VkResult.VK_SUCCESS) {
        throw 'Failed to allocate image memory!';
    }

    vkBindImageMemory(context.device, image, imageMemory, 0);

    return [ image, imageMemory ];
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
        if (!extensions.find(y => y.extensionName == x)) {
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

function hasStencilComponent(format) {
    return format == VK_FORMAT_D32_SFLOAT_S8_UINT || format == VK_FORMAT_D24_UNORM_S8_UINT;
}

function transitionImageLayout(context, image, format, oldLayout, newLayout, mipLevels) {
    const commandBuffer = beginCommandBuffer(context);
    
    const barrier = new VkImageMemoryBarrier({
        srcQueueFamilyIndex: VK_QUEUE_FAMILY_IGNORED,
        dstQueueFamilyIndex: VK_QUEUE_FAMILY_IGNORED,
        subresourceRange: new VkImageSubresourceRange({
            aspectMask: VK_IMAGE_ASPECT_COLOR_BIT,
            baseMipLevel: 0,
            levelCount: mipLevels,
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

    endCommandBuffer(context, commandBuffer);
}

function beginCommandBuffer({ commandPool, device }) {
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

function endCommandBuffer({ commandPool, device, graphicsQueue }, commandBuffer) {
    vkEndCommandBuffer(commandBuffer);

    const submitInfo = new VkSubmitInfo({
        commandBufferCount: 1,
        pCommandBuffers: [ commandBuffer ]
    });
    
    vkQueueSubmit(graphicsQueue, 1, [ submitInfo ], null);

    vkQueueWaitIdle(graphicsQueue);

    vkFreeCommandBuffers(device, commandPool, 1, [ commandBuffer ]);
}

function createInstance(window) {
    const appCreateInfo = new VkApplicationInfo({
        pApplicationName: 'example',
        applicationVersion: VK_MAKE_VERSION(1, 0, 0),
        pEngineName: 'No Engine',
        engineVersion: VK_MAKE_VERSION(1, 0, 0),
        apiVersion: VK_API_VERSION_1_1
    });
    
    let availableValidationLayers = [];
    if (global.debug && !checkValidationLayers(VALIDATION_LAYERS, availableValidationLayers)) {
        console.warn('Validation layers requested, but not available!');
    }
    
    const instanceExtensions = window.getRequiredInstanceExtensions();
    instanceExtensions.push(...INSTANCE_EXTENSIONS);

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

    const instance = new VkInstance();
    const result = vkCreateInstance(instanceInfo, null, instance);
    if (result !== VkResult.VK_SUCCESS) {
        throw 'Failed to create VkInstance!';
    }

    return instance;
}

function createSurface(window, instance) {
    const surface = new VkSurfaceKHR();
    if (window.createSurface(instance, null, surface) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create window surface!';
    }

    return surface;
}

function createPhysicalDevice(instance, surface) {
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

    return foundPhysicalDevice;
}

function createDevice(surface, physicalDevice) {
    let queueFamilyIndeces = { graphicsFamily: null, presentFamily: null };
    findQueueFamilies(physicalDevice, surface, queueFamilyIndeces);

    const graphicsQueueCreateInfo = new VkDeviceQueueCreateInfo({
        queueFamilyIndex: queueFamilyIndeces.graphicsFamily,
        queueCount: 1,
        pQueuePriorities: new Float32Array(1.0)
    });

    const presentQueueCreateInfo = new VkDeviceQueueCreateInfo({
        queueFamilyIndex: queueFamilyIndeces.presentFamily,
        queueCount: 1,
        pQueuePriorities: new Float32Array(1.0)
    })

    const deviceFeatures = new VkPhysicalDeviceFeatures({
        shaderSampledImageArrayDynamicIndexing: true
    });

    const indexingFeatures = new VkPhysicalDeviceDescriptorIndexingFeaturesEXT({
        shaderSampledImageArrayNonUniformIndexing: true,
        runtimeDescriptorArray: true,
        descriptorBindingVariableDescriptorCount: true,
        descriptorBindingPartiallyBound: true
    });

    const deviceCreateInfo = new VkDeviceCreateInfo({
        pNext: indexingFeatures,
        queueCreateInfoCount: 2,
        pQueueCreateInfos: [ graphicsQueueCreateInfo, presentQueueCreateInfo ],
        pEnabledFeatures: deviceFeatures,
        enabledExtensionCount: DEVICE_EXTENSIONS.length,
        ppEnabledExtensionNames: DEVICE_EXTENSIONS
    });

    if (global.debug) {
        deviceCreateInfo.enabledLayerCount = VALIDATION_LAYERS.length;
        deviceCreateInfo.ppEnabledLayerNames = VALIDATION_LAYERS;
    }
    else {
        deviceCreateInfo.enabledLayerCount = 0;
    }

    const device = new VkDevice();
    if (vkCreateDevice(physicalDevice, deviceCreateInfo, null, device) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create logical device!';
    }

    const graphicsQueue = new VkQueue();
    const presentQueue = new VkQueue();

    vkGetDeviceQueue(device, queueFamilyIndeces.graphicsFamily, 0, graphicsQueue);
    vkGetDeviceQueue(device, queueFamilyIndeces.presentFamily, 0, presentQueue);

    return {
        device,
        graphicsQueue,
        presentQueue,
        queueFamilyIndeces
    }
}

function createCommandPool(device, queueFamily) {
    const commandPoolInfo = new VkCommandPoolCreateInfo({
        queueFamilyIndex: queueFamily,
        flags: 0
    });

    const commandPool = new VkCommandPool();
    if (vkCreateCommandPool(device, commandPoolInfo, null, commandPool) !== VkResult.VK_SUCCESS) {
        throw 'failed to create command pool!';
    }

    return commandPool;
}

function isPhysicalDeviceSuitable(physicalDevice) {
    const physicalDeviceProperties = new VkPhysicalDeviceProperties();
    vkGetPhysicalDeviceProperties(physicalDevice, physicalDeviceProperties);

    const physicalDeviceFeatures = new VkPhysicalDeviceFeatures();
    vkGetPhysicalDeviceFeatures(physicalDevice, physicalDeviceFeatures);

    const physicalDeviceProperties2 = new VkPhysicalDeviceProperties2();
    vkGetPhysicalDeviceProperties2(physicalDevice, physicalDeviceProperties2);

    const physicalDeviceFeatures2 = new VkPhysicalDeviceFeatures2();
    vkGetPhysicalDeviceFeatures2(physicalDevice, physicalDeviceFeatures2);

    const extensionsSupported = checkDeviceExtensions(DEVICE_EXTENSIONS, physicalDevice);

    return physicalDeviceProperties.deviceType == VK_PHYSICAL_DEVICE_TYPE_DISCRETE_GPU && physicalDeviceFeatures.geometryShader && extensionsSupported && physicalDeviceFeatures.samplerAnisotropy;
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

function findSwapchainInfo(surface, physicalDevice) {
    const swapchainSupportDetails = { capabilities: null, formats: null, presentModes: null };
    querySurfaceSupport(physicalDevice, surface, swapchainSupportDetails);

    const surfaceFormat = chooseSwapchainSurfaceFormat(swapchainSupportDetails.formats);
    const presentMode = chooseSwapchainPresentMode(swapchainSupportDetails.presentModes);

    const imageCount = swapchainSupportDetails.capabilities.minImageCount + 1;
    if (swapchainSupportDetails.capabilities.maxImageCount > 0 && imageCount > swapchainSupportDetails.capabilities.maxImageCount) {
        imageCount = swapchainSupportDetails.capabilities.maxImageCount;
    }

    return {
        surfaceFormat,
        presentMode,
        imageCount,
        swapchainSupportDetails
    }
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

function createRenderPass(device, surfaceFormat, depthFormat) {
    const colorAttachment = new VkAttachmentDescription({
        format: surfaceFormat.format,
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
        format: depthFormat,
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

    const renderPass = new VkRenderPass();
    if (vkCreateRenderPass(device, renderPassInfo, null, renderPass) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create render pass!';
    }

    return renderPass;
}

function createSyncObjects(device, swapchainImagesCount) {
    const imageAvailableSemaphores = new Array(MAX_FRAMES_IN_FLAIGHT).fill(null).map(() => new VkSemaphore());
    const renderFinishedSemaphores = new Array(MAX_FRAMES_IN_FLAIGHT).fill(null).map(() => new VkSemaphore());
    const inFlightFences = new Array(MAX_FRAMES_IN_FLAIGHT).fill(null).map(() => new VkFence());
    const imagesInFlight = new Array(swapchainImagesCount).fill(null);


    const semaphoreCreateInfo = new VkSemaphoreCreateInfo();
    const fenceCreateInfo = new VkFenceCreateInfo({
        flags: VK_FENCE_CREATE_SIGNALED_BIT
    });

    for (let i = 0; i < MAX_FRAMES_IN_FLAIGHT; i++) {
        if (vkCreateSemaphore(device, semaphoreCreateInfo, null, imageAvailableSemaphores[i]) !== VkResult.VK_SUCCESS ||
            vkCreateSemaphore(device, semaphoreCreateInfo, null, renderFinishedSemaphores[i]) !== VkResult.VK_SUCCESS ||
            vkCreateFence(device, fenceCreateInfo, null, inFlightFences[i]) !== VkResult.VK_SUCCESS) {
            throw 'Failed to create synchronization objects for a frame!';
        }
    }

    return {
        imageAvailableSemaphores,
        renderFinishedSemaphores,
        inFlightFences,
        imagesInFlight
    }
}

function updateBuffer(context, bufferIndex, data, byteOffset) {
    const { bufferSize, bufferMemory } = BUFFERS[bufferIndex];

    copyData(context, bufferMemory, bufferSize, data, byteOffset);
}

function readtexture(path) {
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

function copyBufferToImage(context, buffer, image, width, height) {
    const commandBuffer = beginCommandBuffer(context);

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

    endCommandBuffer(context, commandBuffer);
}

function createTextureImage(context, imgPath) {
    const img = readtexture(imgPath);
    const mipLevels = Math.floor(Math.log2(Math.max(img.width, img.height))) + 1;

    const bufferSize = img.byteLength;
    const [ stagingBuffer, stagingBufferMemory ] = createBuffer(context, bufferSize, VK_BUFFER_USAGE_TRANSFER_SRC_BIT, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);
    copyData(context, stagingBufferMemory, bufferSize, img.data);

    const [ textureImage, textureImageMemory ] = createImage(context, img.width, img.height, mipLevels, VK_FORMAT_R8G8B8A8_SRGB, VK_IMAGE_TILING_OPTIMAL, VK_IMAGE_USAGE_TRANSFER_SRC_BIT | VK_IMAGE_USAGE_TRANSFER_DST_BIT | VK_IMAGE_USAGE_SAMPLED_BIT, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT, textureImage, textureImageMemory);
    
    transitionImageLayout(context, textureImage, VK_FORMAT_R8G8B8A8_SRGB, VK_IMAGE_LAYOUT_UNDEFINED, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, mipLevels);
    copyBufferToImage(context, stagingBuffer, textureImage, img.width, img.height);
    generateMipmaps(context, textureImage, VK_FORMAT_R8G8B8A8_SRGB, img.width, img.height, mipLevels);
    transitionImageLayout(context, textureImage, VK_FORMAT_R8G8B8A8_SRGB, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL, 1);

    vkDestroyBuffer(context.device, stagingBuffer, null);
    vkFreeMemory(context.device, stagingBufferMemory, null);

    const textureImageView = createImageView(context, textureImage, VK_FORMAT_R8G8B8A8_SRGB, mipLevels);
    
    const imageIndex = TEXTURES.push({ 
        image: textureImage, 
        bufferMemory: textureImageMemory,
        view: textureImageView, 
        size: img.length, 
        width: img.width, 
        height: img.height 
    }) - 1;

    return imageIndex;
}

function generateMipmaps(context, image, imageFormat, texWidth, texHeight, mipLevels) {
    const properties = new VkFormatProperties();
    vkGetPhysicalDeviceFormatProperties(context.physicalDevice, imageFormat, properties);

    if(!(properties.optimalTilingFeatures & VK_FORMAT_FEATURE_SAMPLED_IMAGE_FILTER_LINEAR_BIT)) {
        throw new Error('Texture image format does not support linear blitting!');
    }

    const commandBuffer = beginCommandBuffer(context);

    const barrier = new VkImageMemoryBarrier({
        sType: VK_STRUCTURE_TYPE_IMAGE_MEMORY_BARRIER,
        srcQueueFamilyIndex: VK_QUEUE_FAMILY_IGNORED,
        dstQueueFamilyIndex: VK_QUEUE_FAMILY_IGNORED,
        subresourceRange: new VkImageSubresourceRange({
            aspectMask: VK_IMAGE_ASPECT_COLOR_BIT,
            baseArrayLayer: 0,
            layerCount: 1,
            levelCount: 1
        }),
        image
    });

    let mipWidth = texWidth;
    let mipHeight = texHeight;

    for(let i = 1; i < mipLevels; i++) {
        barrier.subresourceRange.baseMipLevel = i - 1;
        barrier.subresourceRange.oldLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
        barrier.subresourceRange.newLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL;
        barrier.subresourceRange.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
        barrier.subresourceRange.dstAccessMask = VK_ACCESS_TRANSFER_READ_BIT;

        vkCmdPipelineBarrier(commandBuffer, VK_PIPELINE_STAGE_TRANSFER_BIT, VK_PIPELINE_STAGE_TRANSFER_BIT, 0, 0, null, 0, null, 1, [ barrier ]);

        const blit = new VkImageBlit({
            srcOffsets: [
                new VkOffset3D({
                    x: 0,
                    y: 0,
                    z: 0
                }),
                new VkOffset3D({
                    x: mipWidth,
                    y: mipHeight,
                    z: 1
                })
            ],
            srcSubresource: new VkImageSubresourceLayers({
                aspectMask: VK_IMAGE_ASPECT_COLOR_BIT,
                mipLevel: i - 1,
                baseArrayLayer: 0,
                layerCount: 1
            }),
            dstOffsets: [
                new VkOffset3D({
                    x: 0,
                    y: 0,
                    z: 0
                }),
                new VkOffset3D({
                    x: mipWidth > 1 ? mipWidth / 2 : 1,
                    y: mipHeight > 1 ? mipHeight / 2 : 1,
                    z: 1
                })
            ],
            dstSubresource: new VkImageSubresourceLayers({
                aspectMask: VK_IMAGE_ASPECT_COLOR_BIT,
                mipLevel: i,
                baseArrayLayer: 0,
                layerCount: 1
            })
        });

        vkCmdBlitImage(commandBuffer, image, VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL, image, VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL, 1, [ blit ], VK_FILTER_LINEAR);
        
        barrier.oldLayout = VK_IMAGE_LAYOUT_TRANSFER_SRC_OPTIMAL;
        barrier.newLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
        barrier.srcAccessMask = VK_ACCESS_TRANSFER_READ_BIT;
        barrier.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;

        vkCmdPipelineBarrier(commandBuffer, VK_PIPELINE_STAGE_TRANSFER_BIT, VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT, 0, 0, null, 0, null, 1, [ barrier ]);

        if (mipWidth > 1) mipWidth /= 2;
        if (mipHeight > 1) mipHeight /= 2;
    }

    barrier.subresourceRange.baseMipLevel = mipLevels - 1;
    barrier.oldLayout = VK_IMAGE_LAYOUT_TRANSFER_DST_OPTIMAL;
    barrier.newLayout = VK_IMAGE_LAYOUT_SHADER_READ_ONLY_OPTIMAL;
    barrier.srcAccessMask = VK_ACCESS_TRANSFER_WRITE_BIT;
    barrier.dstAccessMask = VK_ACCESS_SHADER_READ_BIT;

    vkCmdPipelineBarrier(commandBuffer, VK_PIPELINE_STAGE_TRANSFER_BIT, VK_PIPELINE_STAGE_FRAGMENT_SHADER_BIT, 0, 0, null, 0, null, 1, [ barrier ]);

    endCommandBuffer(context, commandBuffer);
}

function createUniformBuffer(context, data) {
    const bufferSize = data.byteLength;
    const [ buffer, bufferMemory ] = createBuffer(context, bufferSize, VK_BUFFER_USAGE_UNIFORM_BUFFER_BIT, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT);
    copyData(context, bufferMemory, bufferSize, data);

    return BUFFERS.push({ buffer, bufferMemory, size: data.length, bufferSize }) - 1;
}

function createVertexBuffer(context, vertices) {
    if (!(vertices instanceof Float32Array)) {
        throw 'Vertices must be instance of Float32Array!';
    }

    const bufferSize = vertices.byteLength;
    const [ stagingBuffer, stagingBufferMemory ] = createBuffer(context, bufferSize, VK_BUFFER_USAGE_TRANSFER_SRC_BIT, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);
    copyData(context, stagingBufferMemory, bufferSize, vertices);

    const [ buffer, bufferMemory ] = createBuffer(context, bufferSize, VK_BUFFER_USAGE_TRANSFER_DST_BIT | VK_BUFFER_USAGE_VERTEX_BUFFER_BIT, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);
    copyBuffer(context, stagingBuffer, buffer, bufferSize);

    vkDestroyBuffer(context.device, stagingBuffer, null);
    vkFreeMemory(context.device, stagingBufferMemory, null);

    return BUFFERS.push({ buffer, bufferMemory, size: vertices.length, bufferSize }) - 1;
}

function createIndexBuffer(context, indeces) {
    if (!(indeces instanceof Uint16Array)) {
        throw 'indeces must be instance of Uint16Array!';
    }

    const bufferSize = indeces.byteLength;
    const [ stagingBuffer, stagingBufferMemory ] = createBuffer(context, bufferSize, VK_BUFFER_USAGE_TRANSFER_SRC_BIT, VK_MEMORY_PROPERTY_HOST_VISIBLE_BIT | VK_MEMORY_PROPERTY_HOST_COHERENT_BIT);
    copyData(context, stagingBufferMemory, bufferSize, indeces);

    const [ buffer, bufferMemory ] = createBuffer(context, bufferSize, VK_BUFFER_USAGE_TRANSFER_DST_BIT | VK_BUFFER_USAGE_INDEX_BUFFER_BIT, VK_MEMORY_PROPERTY_DEVICE_LOCAL_BIT);
    copyBuffer(context, stagingBuffer, buffer, bufferSize);

    vkDestroyBuffer(context.device, stagingBuffer, null);
    vkFreeMemory(context.device, stagingBufferMemory, null);

    return BUFFERS.push({ buffer, bufferMemory, size: indeces.length, bufferSize }) - 1;
}

function createBuffer(context, bufferSize, usage, properties) {
    const buffer = new VkBuffer();
    const bufferMemory = new VkDeviceMemory();

    const bufferInfo = new VkBufferCreateInfo({
        size: bufferSize,
        usage: usage,
        sharingMode: VK_SHARING_MODE_EXCLUSIVE
    });

    if (vkCreateBuffer(context.device, bufferInfo, null, buffer) !== VkResult.VK_SUCCESS) {
        throw 'Failed to create vertex buffer!';
    }

    let memRequirements = new VkMemoryRequirements();
    vkGetBufferMemoryRequirements(context.device, buffer, memRequirements);
    
    const memAllocInfo = new VkMemoryAllocateInfo({
        allocationSize: memRequirements.size,
        memoryTypeIndex: findMemoryType(context.physicalDevice, memRequirements.memoryTypeBits, properties)
    });

    if (vkAllocateMemory(context.device, memAllocInfo, null, bufferMemory) !== VkResult.VK_SUCCESS) {
        throw 'Failed to allocate vertex buffer memory!';
    }

    vkBindBufferMemory(context.device, buffer, bufferMemory, 0);

    return [ buffer, bufferMemory ];
}

function copyBuffer(context, srcBuffer, dstBuffer, size) {
    const commandBuffer = beginCommandBuffer(context);

    const copyRegion = new VkBufferCopy({
        srcOffset: 0,
        dstOffset: 0,
        size: size
    });
    
    vkCmdCopyBuffer(commandBuffer, srcBuffer, dstBuffer, 1, [copyRegion]);
    
    endCommandBuffer(context, commandBuffer);
}

function copyData(context, dstMemo, byteLen, data, byteOffset = 0) {
    const dataPtr = { $: 0n };
    vkMapMemory(context.device, dstMemo, 0n, byteLen, 0, dataPtr);

    let address = ArrayBuffer.fromAddress(dataPtr.$, byteLen);
    let srcBuffer = data.buffer;
    let src = new Uint8Array(srcBuffer);
    let view = new Uint8Array(address);
    for (let i = byteOffset; i < src.length + byteOffset; ++i) {
        view[i] = src[i - byteOffset];
    }

    vkUnmapMemory(context.device, dstMemo);
}