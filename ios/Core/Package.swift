// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "BeanstalkCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v13)
    ],
    products: [
        .library(name: "BeanstalkCore", targets: ["BeanstalkCore"])
    ],
    targets: [
        .target(name: "BeanstalkCore"),
        .testTarget(
            name: "BeanstalkCoreTests",
            dependencies: ["BeanstalkCore"]
        )
    ]
)
