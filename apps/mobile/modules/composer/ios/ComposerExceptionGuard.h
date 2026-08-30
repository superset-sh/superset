#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Runs a block and reports an Objective-C exception as an error.
///
/// AVFoundation raises `NSException` from some entry points — installing an
/// audio tap above all — and Swift cannot catch those: an uncaught one takes
/// the process down. This is the one place they get turned into the ordinary
/// failure path.
@interface ComposerExceptionGuard : NSObject

+ (BOOL)run:(void (NS_NOESCAPE ^)(void))block error:(NSError **)error;

@end

NS_ASSUME_NONNULL_END
