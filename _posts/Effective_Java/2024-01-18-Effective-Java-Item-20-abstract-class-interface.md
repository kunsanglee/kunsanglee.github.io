---
title: "Effective Java - 아이템 20: 추상 클래스보다는 인터페이스를 우선하라"
categories:
  - Effective Java
tags:
  - Effective Java
toc: true
toc_sticky: true
toc_label: ""
toc_icon: ""
---

자바가 제공하는 다중 구현 메커니즘은 인터페이스와 추상 클래스, 이렇게 두 가지다. 자바 8부터 인터페이스도 디폴트 메서드(default method)를 제공할 수 있게 되어 이제는 두 메커니즘 모두 인스턴스 메서드를 구현 형태로 제공할 수 있다.

### 인터페이스와 추상 클래스의 차이

**추상 클래스가 정의한 타입을 구현하는 클래스는 반드시 추상 클래스의 하위 클래스가 되어야 한다는 점이다.** 자바는 단일 상속만 지원하니, 추상 클래스 방식은 새로운 타입을 정의하는 데 커다란 제약을 안게 되는 셈이다.
반면 인터페이스가 선언한 메서드를 모두 정의하고 그 일반 규약을 잘 지킨 클래스라면 다른 어떤 클래스를 상속했든 같은 타입으로 취급된다.

인터페이스는 기존 클래스에도 손쉽게 구현해넣을 수 있다. 인터페이스가 요구하는 메서드를 추가하고, 클래스 선언에 implements 구문만 추가하면 끝이다. 반면 기존 클래스 위에 새로운 추상 클래스를 끼워넣기는
어려운 게 일반적이다. 두 클래스가 같은 추상 클래스를 확장하길 원한다면, 그 추상 클래스는 계층구조상 두 클래스의 공통 조상이어야 한다. 안타깝게도 이 방식은 클래스 계층 구조에 커다란 혼란을 일으킨다. 새로
추가된 추상 클래스의 모든 자손이 이를 상속하게 되는 것이다.

**인터페이스는 믹스인(mixin) 정의에 안성맞춤이다.** 믹스인이란 클래스가 구현할 수 있는 타입으로, 믹스인을 구현한 클래스에 원래의 ‘주된 타입’ 외에도 특정 선택적 행위를 제공한다고 선언하는 효과를 준다. 예컨대
Comparable은 자신을 구현한 클래스의 인스턴스들끼리는 순서를 정할 수 있다고 선언하는 믹스인 인터페이스다. 이처럼 대상 타입의 주된 기능에 선택적 기능을 ‘혼합(mixed in)’한다고 해서 믹스인이라 부른다. 추상 클래스로는 믹스인을 정의할 수 없다.

인터페이스로는 계층구조가 없는 타입 프레임워크를 만들 수 있다. 예를 들어 가수(Singer), 작곡가(SongWriter) 인터페이스가 있다고 해보자.

```java
public interface Singer {
    AudioClip sing(Song s);
}

public interface SongWriter {
    Song compose(int chartPosition);
}

// 작곡도 하는 가수
// Singer와 SongWriter 모두를 확장하고 새로운 메서드까지 추가한 제 3의 인터페이스
public interface SingerSongWriter extends Singer, SongWriter {
    AudioClip strum();

    void actSensitive();
}
```

래퍼 클래스 관용구와 함께 사용하면 인터페이스는 기능을 향상시키는 안전하고 강력한 수단이 된다.

인터페이스의 메서드 중 구현 방법이 명백한 것이 있다면, 그 구현을 디폴트 메서드로 제공해 프로그래머들의 일감을 덜어줄 수 있다. 디폴트 메서드를 제공할 때는 상속하려는 사람을 위한 설명을 @implSpec 자바독
태그를 붙여 문서화해야 한다.

### 디폴트 메서드의 제약

**equals와 hashCode같은 Object의 메서드는 디폴트 메서드로 제공해서는 안 된다.** 또 인터페이스는 인스턴스 필드를 가질 수 없고 public이 아닌 정적 멤버도 가질 수 없다(단, private 정적 메서드는 예외다).

### 인터페이스와 추상 클래스의 장점을 모두 취하는 방법

인터페이스와 추상 **골격 구현(skeletal implementation)** 클래스를 함께 제공하는 식으로 인터페이스와 추상 클래스의 장점을 모두 취하는 방법도 있다. 인터페이스로는 타입을 정의하고, 필요하면 디폴트
메서드 몇 개도 함께 제공한다. 그리고 골격 구현 클래스는 나머지 메서드들까지 구현한다. 이렇게 해두면 단순히 골격 구현을 확장하는 것만으로 이 인터페이스를 구현하는 데 필요한 일이 대부분 완료된다. 바로 **템플릿 메서드 패턴이다.**

관례상 인터페이스 이름이 Interface라면 그 골격 구현 클래스의 이름은 Abstractinterface로 짓는다. 제대로 설계했다면 골격 구현은(독립된 추상 클래스든 디폴트 메서드로 이루어진 인터페이스든) 그
인터페이스로 나름의 구현을 만들려는 프로그래머의 일을 상당히 덜어준다.

```java
// 골격 구현을 사용해 완성한 구체 클래스
static List<Integer> intArrayAsList(int[] a) {
    Objects.requireNonNull(a);

    return new AbstractList<>() {
        @Override
        public Integer get(int i) {
            return a[i]; // 오토박싱
        }

        @Override
        public Integer set(int i, Integer val) {
            int oldVal = a[i];
            a[i] = val; // 오토언박싱
            return oldVal; // 오토박싱
        }

        @Override
        public int size() {
            return a.length;
        }
    };
}
```

이 예는 int 배열을 받아 Integer 인스턴스 리스트 형태로 보여주는 **어댑터(Adapter)**이기도 하다. 또한 이 구현에서 익명 클래스 형태를 사용했음에 주목하자.

골격 구현 클래스의 아름다움은 추상 클래스처럼 구현을 도와주는 동시에, 추상 클래스로 타입을 정의할 때 따라오는 심각한 제약에서 자유롭다는 점에 있다. 구조상 골격 구현을 확장하지 못하는 처지라면 인터페이스를 직접
구현해야 한다. 이런 경우라도 인터페이스가 직접 제공하는 디폴트 메서드의 이점을 여전히 누릴 수 있다. 또한, 골격 구현 클래스를 우회적으로 이용할 수도 있다. 인터페이스를 구현한 클래스에서 해당 골격 구현을
확장한 private 내부 클래스를 정의하고, 각 메서드 호출을 내부 클래스의 인스턴스에 전달하는 것이다.

### 골격 구현 작성

가장 먼저, 인터페이스를 잘 살펴 다른 메서드들의 구현에 사용되는 기반 메서드들을 선정한다. 이 기반 메서드들은 골격 구현에서는 추상 메서드가 될 것이다. 그 다음 기반 메서드들을 사용해 직접 구현할 수 있는
메서드들을 모두 디폴트 메서드로 제공한다. 단, equals와 hashCode 같은 Object의 메서드는 디폴트 메서드로 제공하면 안 된다는 사실을 항상 유념하자.

간단한 예로 Map.Entry 인터페이스를 살펴보자. getKey, getValue는 확실히 기반메서드이며, 선택적으로 setValue도 포함할 수 있다. Object 메서드들은 디폴트 메서드로 제공해서는 안
되므로, 해당 메서드들은 모두 골격 구현 클래스에서 구현한다. toString도 기반 메서드를 사용해 구현해놨다.

```java
// 골격 구현 클래스
public abstract class AbstractMapEntry<K, V> implements Map.Entry<K, V> {

    // 변경 가능한 엔트리는 이 메서드를 반드시 재정의해야 한다.
    @Override
    public V setValue(V Value) {
        throw new UnsupportedOperationException();
    }

    // Map.Entry.equals의 일반 규약을 구현한다.
    @Override
    public boolean equals(Object o) {
        if (o == this) {
            return true;
        }
        if (!(o instanceof Map.Entry)) {
            return false;
        }
        Map.Entry<?, ?> e = (Map.Entry) o;
        return Objects.equals(e.getKey(), getKey()) && Objects.equals(e.getValue(), getValue());
    }

    // Map.Entry.hashCode의 일반 규약을 구현한다.
    @Override
    public int hashCode() {
        return Objects.hashCode(getKey()) ^ Objects.hashCode(getValue());
    }

    @Override
    public String toString() {
        return getKey() + "=" + getValue();
    }
}
```
>Map.Entry 인터페이스나 그 하위 인터페이스로는 이 골격 구현을 제공할 수 없다. 디폴트 메서드는 equals, hashCode, toString 같은 Object 메서드를 재정의할 수 없기 때문이다.

단순 구현(simple implementation)은 골격 구현의 작은 변종으로, AbstractMap.SimpleEntry가 좋은 예다. 단순 구현도 골격 구현과 같이 상속을 위해 인터페이스를 구현한 것이지만,
추상 클래스가 아니란 점이 다르다. 쉽게 말해 동작하는 가장 단순한 구현이다. 이러한 단순 구현은 그대로 써도 되고 필요에 맞게 확장해도 된다.

### 핵심 정리

**일반적으로 다중 구현용 타입으로는 인터페이스가 가장 적합하다.** 복잡한 인터페이스라면 구현하는 수고를 덜어주는 골격 구현을 함께 제공하는 방법을 꼭 고려해보자. 골격 구현은 ‘가능한 한’ 인터페이스의 디폴트 메서드로
제공하여 그 인터페이스를 구현한 모든 곳에서 활용하도록 하는 것이 좋다. ‘가능한 한’이라고 한 이유는, 인터페이스에 걸려있는 구현상의 제약 때문에 골격 구현을 추상 클래스로 제공하는 경우가 더 흔하기 때문이다.
